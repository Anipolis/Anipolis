import { jstBroadcastDate } from "$lib/syobocal-schedule";
import type { Anime, BroadcastRoomOverride } from "$lib/types";
import {
	type BroadcastEpisodeSlot,
	inferEpisodeNumbersBackward,
	inferEpisodeNumbersForward,
	normalizedBroadcastEpisodeLabel,
} from "$lib/utils/broadcast-episodes";
import { broadcastTimeMinutes, isEligibleForRoomLog, roomDateKey } from "$lib/utils/broadcast-room";

export type BroadcastEpisodeLogSlot = BroadcastEpisodeSlot & { opened: boolean };

type BroadcastEpisodeLogAnime = Pick<
	Anime,
	"season" | "room_type" | "aired_from" | "aired_to" | "broadcast_day" | "broadcast_time"
>;

/**
 * 各話ルームの履歴タイムラインを組み立てる。実在セッション（しょぼい由来の
 * 話数付きスナップショット）が唯一の情報源で、曜日からの機械カウントはしない。
 * 管理者オーバーライドはラベル（総集編等）の上書きにだけ使う。
 *
 * しょぼい同期開始前の放送分にはセッション行が無いため、ルームページの合成表示
 * （対象シーズン+曜日・放送期間ゲート）と同じルールで過去日を補完し、しょぼい
 * 話数（アンカー）からの逆算で番号を振る。アンカーはローリング同期の範囲でしか
 * 付かないので、未開場の番号付きセッションも逆算には参加させる（opened=false、
 * ログ表示は呼び出し側で opened のみに絞る）。
 *
 * 返り値は日付昇順。
 */
export function buildBroadcastEpisodeLog(
	anime: BroadcastEpisodeLogAnime,
	snapshots: readonly BroadcastEpisodeLogSlot[],
	overrides: readonly BroadcastRoomOverride[],
): BroadcastEpisodeLogSlot[] {
	const overrideByDate = new Map(overrides.map((override) => [roomDateKey(override.room_date), override]));
	// 放送休止オーバーライドの日はセッション行が残っていてもログから除外する
	// （ルームページも休止日は404）。番号のカウントも消費しない。
	const slotByDate = new Map<string, BroadcastEpisodeLogSlot>(
		snapshots.flatMap((snapshot) => {
			const override = overrideByDate.get(snapshot.date);
			if (override?.is_cancelled) return [];
			return [
				[
					snapshot.date,
					{
						...snapshot,
						label: (override ? normalizedBroadcastEpisodeLabel(override) : null) ?? snapshot.label,
					},
				] as const,
			];
		}),
	);
	// 合成補完の曜日はしょぼい由来の話数付きセッション（アンカー）の曜日を最優先
	// する。MAL由来の broadcast_day が AT-X 等の先行放送の曜日を指している作品
	// （骸骨騎士様Ⅱ: MAL=月曜(AT-X) / 地上波最速=MX木曜）で、存在しない曜日の
	// 日付を合成してしまうのを防ぐ。room_date は放送日慣習で統一されているので
	// アンカーの曜日はそのままログの週次パターンになる。
	const anchorSlot = [...slotByDate.values()]
		.filter((slot) => slot.start != null)
		.sort((left, right) => left.date.localeCompare(right.date))[0];
	const effectiveBroadcastDay = anchorSlot ? new Date(`${anchorSlot.date}T00:00:00`).getDay() : anime.broadcast_day;
	if (
		isEligibleForRoomLog(anime.season) &&
		anime.room_type === "episode" &&
		anime.aired_from != null &&
		effectiveBroadcastDay != null &&
		anime.broadcast_time != null
	) {
		const todayKey = jstBroadcastDate(new Date());
		const airedToKey = anime.aired_to?.slice(0, 10) ?? null;
		const cursor = new Date(`${anime.aired_from.slice(0, 10)}T00:00:00`);
		// MALの開始日は24時超の慣習表記に対応せず、深夜帯では翌日の実日付が入る
		// ことがある。24時以降の作品は1日前から探索を始めて放送日慣習（前日側）の
		// 週次パターンに吸着させる。開始日が既に慣習日なら曜日が合わず素通りする
		// だけなので影響しない。
		if ((broadcastTimeMinutes(anime.broadcast_time) ?? 0) >= 24 * 60) cursor.setDate(cursor.getDate() - 1);
		while (cursor.getDay() !== effectiveBroadcastDay) cursor.setDate(cursor.getDate() + 1);
		for (let guard = 0; guard < 400; guard += 1, cursor.setDate(cursor.getDate() + 7)) {
			const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
			if (date >= todayKey || (airedToKey && date > airedToKey)) break;
			if (slotByDate.has(date)) continue;
			const override = overrideByDate.get(date);
			if (override?.is_cancelled) continue;
			slotByDate.set(date, {
				date,
				start: null,
				end: null,
				label: override ? normalizedBroadcastEpisodeLabel(override) : null,
				opened: true,
			});
		}
	}
	const ascending = [...slotByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
	// オーバーライド（話数明示・総集編）を尊重した逆算。整合しない作品は番号なしのまま。
	inferEpisodeNumbersBackward(ascending, overrideByDate);
	// アンカーが1件も無い＝しょぼい同期開始前に放送を終えた作品は、逆算の起点が
	// 永遠に得られない。放送終了済みに限り、第1話からの前進カウントで補う
	// （放送中でアンカーが無いのはマッピング不備なので番号なしのまま残す）。
	const ended = anime.aired_to != null && anime.aired_to.slice(0, 10) < jstBroadcastDate(new Date());
	if (!anchorSlot && ended) inferEpisodeNumbersForward(ascending, overrideByDate);
	return ascending;
}
