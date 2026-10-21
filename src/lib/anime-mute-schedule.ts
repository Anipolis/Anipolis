import {
	dateKeyWeekday,
	isDateKey,
	jstBroadcastDateKey,
	jstWallClockToDate,
	LATE_NIGHT_BOUNDARY_HOUR,
} from "$lib/utils/jst";

/**
 * アニメのミュート期間の判定（#326）。
 *
 * サービスの「放送日」は JST の午前4時で日付が変わる（深夜25時台の放送は前日扱い）。
 * 以前はサーバーの時刻帯の getDay() や `${roomDate}T00:00:00` を使っていたため、UTC で動く
 * Cloudflare と JST の開発環境で結果が変わり、深夜放送ではミュートが放送前に切れることがあった。
 * どちらも JST の放送日で決める。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 毎週くり返すミュートが今効いているか。放送曜日から数えて period_days 日（放送日単位）の間ミュートする。
 * 例: 水曜放送・1日なら、水曜 04:00 JST 〜 木曜 04:00 JST。
 */
export function isRepeatMuteActive(broadcastDay: number, periodDays: number, now: Date | number = Date.now()): boolean {
	const today = dateKeyWeekday(jstBroadcastDateKey(now));
	if (today === null) return false;
	const daysSince = (today - broadcastDay + 7) % 7;
	return daysSince < periodDays;
}

/**
 * 1回だけのミュートの終了時刻。起点はルームの放送日の始まり（JST 04:00）で、そこから period_days 日。
 * ルームの外（放送日の指定なし）で設定したときは、設定した時刻から数える。
 */
export function computeMutedUntil(roomDate: string | null, periodDays: number, now: Date | number = Date.now()): Date {
	const start = roomDate && isDateKey(roomDate) ? jstWallClockToDate(roomDate, LATE_NIGHT_BOUNDARY_HOUR) : null;
	const base = start ?? new Date(now);
	return new Date(base.getTime() + periodDays * DAY_MS);
}
