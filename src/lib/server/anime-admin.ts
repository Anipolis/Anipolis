import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import { validateImageBuffer } from "$lib/server/upload";
import type { Database } from "$lib/supabase/database.types";
import type { BroadcastOverrideKind } from "$lib/utils/broadcast-episodes";

const ALLOWED_INLINE_COVER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type AnimeWriteResult = { success: true; animeId: string } | ReturnType<typeof fail<{ message: string }>>;

// リゾルバ（anime-catalog-resolver）が manual ソースとして参照するキー。
// 管理画面での編集をこのキーに限って anime_source_records(source='manual') に
// 差分保存し、週次のカタログ再解決で上書きされないようにする。ここに無い
// フィールド（broadcast_duration や room 系）はリゾルバが触らないので不要。
const MANUAL_SOURCE_KEYS = [
	"title",
	"title_en",
	"title_romaji",
	"season",
	"episode_count",
	"type",
	"source",
	"aired_from",
	"aired_to",
	"genre",
	"studio",
	"producer",
	"official_site_url",
	"official_x_url",
	"cover_url",
	"broadcast_day",
	"broadcast_time",
] as const;

/**
 * 管理画面の編集内容を manual ソースレコードへ差分マージする。失敗しても
 * anime 行の更新自体は成功しているので、ログだけ残して処理は続行する。
 */
async function upsertManualSourceRecord(
	// biome-ignore lint/suspicious/noExplicitAny: generated types may lag behind source-record migrations
	writer: SupabaseClient<any>,
	malId: number,
	previous: Record<string, unknown>,
	payload: Record<string, unknown>,
) {
	const changed: Record<string, unknown> = {};
	for (const key of MANUAL_SOURCE_KEYS) {
		if (!(key in payload)) continue;
		const next = payload[key] ?? null;
		if (JSON.stringify(next) !== JSON.stringify(previous[key] ?? null)) changed[key] = next;
	}
	if (Object.keys(changed).length === 0) return;

	const { data: existing } = await writer
		.from("anime_source_records")
		.select("normalized_data,source_url")
		.eq("mal_id", malId)
		.eq("source", "manual")
		.maybeSingle();
	const { error } = await writer.from("anime_source_records").upsert(
		{
			mal_id: malId,
			source: "manual",
			source_version: new Date().toISOString().slice(0, 10),
			source_url: (existing?.source_url as string | null) ?? null,
			normalized_data: { ...((existing?.normalized_data as Record<string, unknown>) ?? {}), ...changed },
		},
		{ onConflict: "mal_id,source" },
	);
	if (error) console.error("manual source record upsert failed:", error.message);
}

function normalizeBroadcastTime(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
	if (!match) return undefined;

	const hour = Number(match[1]);
	if (!Number.isInteger(hour) || hour < 0 || hour > 47) return undefined;

	return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function normalizeEpisodeCount(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const episodeCount = Number(raw);
	if (!Number.isInteger(episodeCount) || episodeCount < 1) return undefined;

	return raw;
}

function normalizeBroadcastDuration(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return 30;

	const minutes = Number(raw);
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return undefined;
	return minutes;
}

function normalizeOptionalMinutes(value: string | null | undefined, max: number) {
	const raw = value?.trim();
	if (!raw) return null;

	const minutes = Number(raw);
	if (!Number.isInteger(minutes) || minutes < 0 || minutes > max) return undefined;
	return minutes;
}

function normalizeOptionalEpisode(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const episode = Number(raw);
	if (!Number.isInteger(episode) || episode < 1) return undefined;
	return episode;
}

function normalizeOptionalEpisodeIncrement(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const increment = Number(raw);
	if (!Number.isInteger(increment) || increment < 0 || increment > 99) return undefined;
	return increment;
}

function normalizeOverrideKind(value: string | null | undefined): BroadcastOverrideKind {
	switch (value) {
		case "cancelled":
		case "recap":
		case "time_change":
		case "marathon":
		case "custom":
			return value;
		default:
			return "custom";
	}
}

function toArr(vals: FormDataEntryValue[]) {
	return vals.map((v) => (v as string).trim()).filter(Boolean);
}

function nullableText(fd: FormData, name: string) {
	return (fd.get(name) as string | null)?.trim() || null;
}

function parseBroadcastDay(fd: FormData) {
	const v = (fd.get("broadcast_day") as string | null)?.trim();
	return v !== "" && v != null ? parseInt(v, 10) : null;
}

function parseBroadcastStations(fd: FormData) {
	const v = (fd.get("broadcast_station") as string | null)?.trim();
	if (!v) return null;
	const arr = v
		.split(/[,\u3001]/)
		.map((s) => s.trim())
		.filter(Boolean);
	return arr.length ? arr : null;
}

function parseRoomType(fd: FormData) {
	return fd.get("room_type") === "global" ? "global" : "episode";
}

async function uploadInlineCover(supabase: SupabaseClient<Database>, fd: FormData, fallbackCoverUrl: string | null) {
	let coverUrl = nullableText(fd, "cover_url") ?? fallbackCoverUrl;
	const imageFile = fd.get("image_file");
	if (imageFile instanceof File && imageFile.size > 0) {
		const arrayBuffer = await imageFile.arrayBuffer();
		const validated = validateImageBuffer(arrayBuffer, ALLOWED_INLINE_COVER_TYPES);
		if (validated) {
			const path = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}.${validated.ext}`;
			const { error: uploadError } = await supabase.storage
				.from("anime-covers")
				.upload(path, arrayBuffer, { contentType: validated.mime, upsert: false });
			if (!uploadError) {
				coverUrl = supabase.storage.from("anime-covers").getPublicUrl(path).data.publicUrl;
			}
		}
	}
	return coverUrl;
}

async function buildAnimePayload(supabase: SupabaseClient<Database>, fd: FormData, fallbackCoverUrl: string | null) {
	const title = nullableText(fd, "title");
	if (!title) return fail(400, { message: "タイトルは必須です" });

	const episodeCount = normalizeEpisodeCount(fd.get("episode_count") as string | null);
	if (episodeCount === undefined) {
		return fail(400, { message: "話数は1以上の整数で入力してください" });
	}

	const broadcastTime = normalizeBroadcastTime(fd.get("broadcast_time") as string | null);
	if (broadcastTime === undefined) {
		return fail(400, { message: "放送時刻は 23:30 や 26:00 の形式で入力してください" });
	}

	const broadcastDurationMinutes = normalizeBroadcastDuration(fd.get("broadcast_duration_minutes") as string | null);
	if (broadcastDurationMinutes === undefined) {
		return fail(400, { message: "放送枠は1〜1440分の整数で入力してください" });
	}

	return {
		title,
		title_en: nullableText(fd, "title_en"),
		title_romaji: nullableText(fd, "title_romaji"),
		synopsis: nullableText(fd, "synopsis"),
		cover_url: await uploadInlineCover(supabase, fd, fallbackCoverUrl),
		season: nullableText(fd, "season"),
		episode_count: episodeCount,
		type: nullableText(fd, "type"),
		aired_from: nullableText(fd, "aired_from"),
		aired_to: nullableText(fd, "aired_to"),
		source: nullableText(fd, "source"),
		genre: toArr(fd.getAll("genre")),
		studio: toArr(fd.getAll("studio")),
		producer: toArr(fd.getAll("producer")),
		official_hashtag: toArr(fd.getAll("official_hashtag")),
		official_site_url: nullableText(fd, "official_site_url"),
		official_x_url: nullableText(fd, "official_x_url"),
		copyright: nullableText(fd, "copyright"),
		broadcast_day: parseBroadcastDay(fd),
		broadcast_time: broadcastTime,
		broadcast_duration_minutes: broadcastDurationMinutes,
		broadcast_station: parseBroadcastStations(fd),
		room_type: parseRoomType(fd),
		// 管理画面からの保存は明示操作: 総合ロビー自動判定の対象から外す
		room_type_source: "manual",
	};
}

export async function registerAnimeAction(
	supabase: SupabaseClient<Database>,
	request: Request,
): Promise<AnimeWriteResult> {
	const fd = await request.formData();
	const payload = await buildAnimePayload(supabase, fd, null);
	if ("status" in payload) return payload;

	// biome-ignore lint/suspicious/noExplicitAny: shared writer must tolerate generated type lag after migrations
	const animeWriter = supabase as SupabaseClient<any>;
	const { data, error } = await animeWriter.from("anime").insert(payload).select("id").single();

	if (error) return fail(500, { message: `登録エラー: ${error.message}` });
	return { success: true, animeId: String((data as { id: number }).id) };
}

export async function updateAnimeAction(
	supabase: SupabaseClient<Database>,
	request: Request,
	animeId: string,
	currentCoverUrl: string | null,
): Promise<AnimeWriteResult> {
	const fd = await request.formData();
	const payload = await buildAnimePayload(supabase, fd, currentCoverUrl);
	if ("status" in payload) return payload;

	// biome-ignore lint/suspicious/noExplicitAny: shared writer must tolerate generated type lag after migrations
	const animeWriter = supabase as SupabaseClient<any>;
	const { data: previousRow } = await animeWriter
		.from("anime")
		.select(`mal_id,${MANUAL_SOURCE_KEYS.join(",")}`)
		.eq("id", animeId)
		.maybeSingle();
	const { data, error } = await animeWriter.from("anime").update(payload).eq("id", animeId).select("id").single();

	if (error) return fail(500, { message: `更新エラー: ${error.message}` });

	// 編集差分を manual ソースとして保存し、カタログ再解決での上書きを防ぐ
	const malId = (previousRow as { mal_id: number | null } | null)?.mal_id;
	if (malId != null) {
		await upsertManualSourceRecord(
			animeWriter,
			malId,
			(previousRow ?? {}) as Record<string, unknown>,
			payload as Record<string, unknown>,
		);
	}
	return { success: true, animeId: String((data as { id: number }).id) };
}

type BroadcastOverrideWriteResult = { success: true } | ReturnType<typeof fail<{ message: string }>>;

export async function addBroadcastOverrideAction(
	supabase: SupabaseClient<Database>,
	request: Request,
	animeId: string,
): Promise<BroadcastOverrideWriteResult> {
	const fd = await request.formData();

	const roomDate = nullableText(fd, "room_date");
	if (!roomDate || !/^\d{4}-\d{2}-\d{2}$/.test(roomDate)) {
		return fail(400, { message: "日付を YYYY-MM-DD 形式で入力してください" });
	}

	const broadcastTime = normalizeBroadcastTime(fd.get("broadcast_time") as string | null);
	if (broadcastTime === undefined) {
		return fail(400, { message: "放送時刻は 23:30 や 26:00 の形式で入力してください" });
	}

	const durationMinutes = normalizeOptionalMinutes(fd.get("duration_minutes") as string | null, 1440);
	if (durationMinutes === undefined) {
		return fail(400, { message: "放送時間は0〜1440分の整数で入力してください" });
	}

	const preOpenMinutes = normalizeOptionalMinutes(fd.get("pre_open_minutes") as string | null, 1440);
	if (preOpenMinutes === undefined) {
		return fail(400, { message: "投稿開始の前倒し時間は0〜1440分の整数で入力してください" });
	}

	const postCloseMinutes = normalizeOptionalMinutes(fd.get("post_close_minutes") as string | null, 1440);
	if (postCloseMinutes === undefined) {
		return fail(400, { message: "投稿終了の延長時間は0〜1440分の整数で入力してください" });
	}

	const overrideKind = normalizeOverrideKind(fd.get("override_kind") as string | null);
	const isCancelled = overrideKind === "cancelled" || fd.get("is_cancelled") === "on";

	const episodeStart = normalizeOptionalEpisode(fd.get("episode_start") as string | null);
	if (episodeStart === undefined) {
		return fail(400, { message: "対象話数（開始）は1以上の整数で入力してください" });
	}

	const episodeEnd = normalizeOptionalEpisode(fd.get("episode_end") as string | null);
	if (episodeEnd === undefined) {
		return fail(400, { message: "対象話数（終了）は1以上の整数で入力してください" });
	}

	let episodeCountIncrement = normalizeOptionalEpisodeIncrement(fd.get("episode_count_increment") as string | null);
	if (episodeCountIncrement === undefined) {
		return fail(400, { message: "話数カウントの進み方は0以上の整数で入力してください" });
	}

	if ((episodeStart == null) !== (episodeEnd == null)) {
		return fail(400, { message: "対象話数は開始・終了をどちらも入力するか、どちらも空にしてください" });
	}

	if (episodeStart != null && episodeEnd != null && episodeEnd < episodeStart) {
		return fail(400, { message: "対象話数（終了）は開始以上の値を入力してください" });
	}

	let episodeLabel = nullableText(fd, "episode_label");
	let announcementLabel = nullableText(fd, "announcement_label");
	if (overrideKind === "recap") {
		episodeLabel ??= "総集編";
		episodeCountIncrement ??= 0;
	}
	if (overrideKind === "cancelled") {
		announcementLabel ??= "今週は放送休止";
	}
	if (
		overrideKind === "time_change" &&
		broadcastTime == null &&
		durationMinutes == null &&
		preOpenMinutes == null &&
		postCloseMinutes == null
	) {
		return fail(400, { message: "放送時間変更では変更後の時刻・放送時間・投稿時間のいずれかを入力してください" });
	}
	if (overrideKind === "marathon" && (episodeStart == null || episodeEnd == null || episodeEnd <= episodeStart)) {
		return fail(400, { message: "一挙放送では対象話数の開始より大きい終了話数を入力してください" });
	}

	// biome-ignore lint/suspicious/noExplicitAny: broadcast_room_overrides not yet in generated types
	const writer = supabase as SupabaseClient<any>;
	const { error } = await writer.from("broadcast_room_overrides").upsert(
		{
			anime_id: Number(animeId),
			room_date: roomDate,
			override_kind: overrideKind,
			broadcast_time: broadcastTime,
			duration_minutes: durationMinutes,
			pre_open_minutes: preOpenMinutes,
			post_close_minutes: postCloseMinutes,
			episode_start: episodeStart,
			episode_end: episodeEnd,
			episode_label: episodeLabel,
			episode_count_increment: episodeCountIncrement,
			is_cancelled: isCancelled,
			announcement_label: announcementLabel,
			note: nullableText(fd, "note"),
		},
		{ onConflict: "anime_id,room_date" },
	);

	if (error) return fail(500, { message: `登録エラー: ${error.message}` });
	return { success: true };
}

export async function deleteBroadcastOverrideAction(
	supabase: SupabaseClient<Database>,
	request: Request,
): Promise<BroadcastOverrideWriteResult> {
	const fd = await request.formData();
	const overrideId = nullableText(fd, "override_id");
	if (!overrideId) return fail(400, { message: "対象が見つかりません" });

	// biome-ignore lint/suspicious/noExplicitAny: broadcast_room_overrides not yet in generated types
	const writer = supabase as SupabaseClient<any>;
	const { error } = await writer.from("broadcast_room_overrides").delete().eq("id", overrideId);

	if (error) return fail(500, { message: `削除エラー: ${error.message}` });
	return { success: true };
}
