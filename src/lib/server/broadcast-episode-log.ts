import { jstBroadcastDate } from "$lib/syobocal-schedule";
import type { Anime, BroadcastRoomOverride } from "$lib/types";
import {
	type BroadcastEpisodeSlot,
	inferEpisodeNumbersBackward,
	normalizedBroadcastEpisodeLabel,
} from "$lib/utils/broadcast-episodes";
import { isEligibleForRoomLog, roomDateKey } from "$lib/utils/broadcast-room";

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
	if (
		isEligibleForRoomLog(anime.season) &&
		anime.room_type === "episode" &&
		anime.aired_from != null &&
		anime.broadcast_day != null &&
		anime.broadcast_time != null
	) {
		const todayKey = jstBroadcastDate(new Date());
		const airedToKey = anime.aired_to?.slice(0, 10) ?? null;
		const cursor = new Date(`${anime.aired_from.slice(0, 10)}T00:00:00`);
		while (cursor.getDay() !== anime.broadcast_day) cursor.setDate(cursor.getDate() + 1);
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
	return ascending;
}
