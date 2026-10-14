import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import { MAX_EPISODE_NUMBER } from "$lib/episode-room";
import type { Database } from "$lib/supabase/database.types";

/**
 * 話数ルーム（153）の管理操作。作品ページの管理タブから呼ぶ。
 * episode_rooms には書き込みのポリシーが無いので、呼び出し側で管理者を確かめたうえで service role で書く。
 *
 *   * 特番ルームを設置する（自動では作らない。放送期間中に特番がありそうなときに管理者が置く）
 *   * 話のルームを開く時刻を設定する（週1配信の ONA など。放送枠で上書きされないよう固定する）
 *   * 再放送・イベントの放送枠を足す（新しいルームは作らず、話数ルームの中の区切りになる）
 *   * 同じ話のルームを統合する（話数のずれで二重にできたとき。放送枠の無いルームだけ）
 */

type Admin = SupabaseClient<Database>;

const SPECIAL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

function text(form: FormData, key: string): string {
	return ((form.get(key) as string | null) ?? "").trim();
}

function episodeNumberOf(form: FormData, key = "episode_number"): number | null {
	const value = text(form, key);
	if (!/^[1-9][0-9]{0,3}$/.test(value)) return null;
	const n = Number(value);
	return n <= MAX_EPISODE_NUMBER ? n : null;
}

/** datetime-local（JST の「2026-10-20T23:30」）を ISO に。空なら null、形式違いは undefined */
export function parseJstDateTime(value: string): string | null | undefined {
	if (!value) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!match) return undefined;
	const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
	const ms = Date.UTC(y, mo - 1, d, h - 9, mi);
	const check = new Date(ms + 9 * 60 * 60 * 1000);
	if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
	return new Date(ms).toISOString();
}

/** 特番ルームを設置する */
export async function addSpecialRoomAction(admin: Admin, animeId: number, form: FormData) {
	const specialKey = text(form, "special_key").toLowerCase();
	const label = text(form, "label");
	if (!SPECIAL_KEY_PATTERN.test(specialKey)) {
		return fail(400, { roomMessage: "URL の名前は半角の英小文字・数字・ハイフンで40文字までにしてください" });
	}
	if (!label || label.length > 60) return fail(400, { roomMessage: "表示名を60文字以内で入力してください" });
	const opensAt = parseJstDateTime(text(form, "opens_at"));
	if (opensAt === undefined) return fail(400, { roomMessage: "開く時刻の形式が正しくありません" });

	const { error } = await admin.from("episode_rooms").insert({
		anime_id: animeId,
		kind: "special",
		special_key: specialKey,
		label,
		opens_at: opensAt,
		// 管理者が決めた開く時刻は放送枠で動かさない
		opens_at_locked: opensAt != null,
	});
	if (error?.code === "23505") return fail(409, { roomMessage: "同じ URL の名前の特番ルームがあります" });
	if (error) {
		console.error("addSpecialRoomAction error:", error);
		return fail(500, { roomMessage: "特番ルームを作れませんでした" });
	}
	return { roomMessage: `特番ルーム「${label}」を作りました`, roomSuccess: true };
}

/** 話のルームを開く時刻を設定する（固定）。空にすると固定を外し、放送枠から計算し直す */
export async function setEpisodeRoomOpensAtAction(admin: Admin, animeId: number, form: FormData) {
	const episodeNumber = episodeNumberOf(form);
	if (episodeNumber == null) return fail(400, { roomMessage: "話数を正しく入力してください" });
	const opensAt = parseJstDateTime(text(form, "opens_at"));
	if (opensAt === undefined) return fail(400, { roomMessage: "開く時刻の形式が正しくありません" });

	const { data: existing } = await admin
		.from("episode_rooms")
		.select("id")
		.eq("anime_id", animeId)
		.eq("kind", "episode")
		.eq("episode_number", episodeNumber)
		.maybeSingle();

	if (opensAt == null) {
		if (!existing) return { roomMessage: `第${episodeNumber}話のルームはまだありません`, roomSuccess: true };
		const { error } = await admin.from("episode_rooms").update({ opens_at_locked: false }).eq("id", existing.id);
		if (error) return fail(500, { roomMessage: "固定を外せませんでした" });
		// 放送枠から計算し直す（放送枠が無ければそのまま）
		await admin.rpc("refresh_episode_room_opens_at", { p_room_id: existing.id });
		return { roomMessage: `第${episodeNumber}話の開く時刻の固定を外しました`, roomSuccess: true };
	}

	const { error } = existing
		? await admin.from("episode_rooms").update({ opens_at: opensAt, opens_at_locked: true }).eq("id", existing.id)
		: await admin.from("episode_rooms").insert({
				anime_id: animeId,
				kind: "episode",
				episode_number: episodeNumber,
				opens_at: opensAt,
				opens_at_locked: true,
			});
	if (error) {
		console.error("setEpisodeRoomOpensAtAction error:", error);
		return fail(500, { roomMessage: "開く時刻を設定できませんでした" });
	}
	return { roomMessage: `第${episodeNumber}話のルームを開く時刻を設定しました`, roomSuccess: true };
}

/** 再放送・イベントの放送枠を足す。話数ルームの中の区切りになる（新しいルームは作らない） */
export async function addEpisodeAiringAction(admin: Admin, animeId: number, form: FormData) {
	const episodeNumber = episodeNumberOf(form);
	if (episodeNumber == null) return fail(400, { roomMessage: "話数を正しく入力してください" });
	const airingKind = text(form, "airing_kind");
	if (airingKind !== "rerun" && airingKind !== "event") {
		return fail(400, { roomMessage: "放送枠の種類を選んでください" });
	}
	const scheduledAt = parseJstDateTime(text(form, "scheduled_at"));
	if (!scheduledAt) return fail(400, { roomMessage: "放送開始の日時を入力してください" });
	const duration = Number(text(form, "duration_minutes") || "30");
	if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
		return fail(400, { roomMessage: "放送時間は1〜1440分の整数で入力してください" });
	}
	const channelName = text(form, "channel_name").slice(0, 60) || null;

	// 放送日は朝4時区切り（JST）。日付のルームの URL と同じ数え方
	const jst = new Date(Date.parse(scheduledAt) + 9 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000);
	const roomDate = jst.toISOString().slice(0, 10);
	const scheduledMs = Date.parse(scheduledAt);
	const { error } = await admin.from("broadcast_room_sessions").insert({
		anime_id: animeId,
		room_kind: "episode",
		room_key: roomDate,
		room_date: roomDate,
		scheduled_at: scheduledAt,
		duration_minutes: duration,
		// 開場は5分前、受付は放送の30分後まで（しょぼいカレンダー由来の放送枠の既定と同じ）
		posting_opens_at: new Date(scheduledMs - 5 * 60_000).toISOString(),
		posting_closes_at: new Date(scheduledMs + (duration + 30) * 60_000).toISOString(),
		episode_number: episodeNumber,
		airing_kind: airingKind,
		source_channel_name: channelName,
		// schedule_source は付けない（しょぼいカレンダー由来ではない。同期の陳腐化削除の対象にならない）
	});
	if (error?.code === "23505") {
		return fail(409, { roomMessage: `${roomDate} には既に放送枠があります（1日に1枠まで）` });
	}
	if (error) {
		console.error("addEpisodeAiringAction error:", error);
		return fail(500, { roomMessage: "放送枠を追加できませんでした" });
	}
	return {
		roomMessage: `第${episodeNumber}話に${airingKind === "rerun" ? "再放送" : "イベント"}の放送枠を追加しました`,
		roomSuccess: true,
	};
}

/**
 * 同じ話のルームを統合する。統合元の投稿を統合先へ移し、統合元に merged_into を付ける（元の URL は統合先へ転送）。
 * 放送枠のあるルームは、放送枠の話数を直す（話数の訂正）ことで移すので、ここでは扱わない。
 */
export async function mergeEpisodeRoomsAction(admin: Admin, animeId: number, form: FormData) {
	const from = episodeNumberOf(form, "from_episode");
	const to = episodeNumberOf(form, "to_episode");
	if (from == null || to == null || from === to)
		return fail(400, { roomMessage: "統合元と統合先の話数を正しく入力してください" });

	const { data: rooms } = await admin
		.from("episode_rooms")
		.select("id, episode_number, merged_into")
		.eq("anime_id", animeId)
		.eq("kind", "episode")
		.in("episode_number", [from, to]);
	const source = rooms?.find((room) => room.episode_number === from);
	const target = rooms?.find((room) => room.episode_number === to);
	if (!source || !target) return fail(404, { roomMessage: "統合元か統合先のルームがありません" });
	if (source.merged_into || target.merged_into) return fail(400, { roomMessage: "すでに統合したルームです" });

	const { count: airingCount } = await admin
		.from("broadcast_room_sessions")
		.select("id", { count: "exact", head: true })
		.eq("episode_room_id", source.id);
	if ((airingCount ?? 0) > 0) {
		return fail(400, {
			roomMessage: `第${from}話のルームには放送枠があります。先に放送枠の話数を直してください（話数の訂正）`,
		});
	}

	const { error: moveError } = await admin
		.from("posts")
		.update({ episode_room_id: target.id })
		.eq("episode_room_id", source.id);
	if (moveError) {
		console.error("mergeEpisodeRoomsAction move error:", moveError);
		return fail(500, { roomMessage: "投稿を移せませんでした" });
	}
	const { error } = await admin.from("episode_rooms").update({ merged_into: target.id }).eq("id", source.id);
	if (error) {
		console.error("mergeEpisodeRoomsAction error:", error);
		return fail(500, { roomMessage: "統合できませんでした（投稿は移動済み）" });
	}
	return { roomMessage: `第${from}話のルームを第${to}話に統合しました`, roomSuccess: true };
}
