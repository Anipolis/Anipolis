/**
 * JST（Asia/Tokyo）固定の日付ユーティリティ。
 *
 * サービスは JST 前提で「今日」「曜日」「週の範囲」を決めるが、Cloudflare Workers の
 * サーバー TZ は UTC、ブラウザ TZ は利用者次第で一定しない。そのため Date のローカル
 * getter/setter（getDay / setHours / toLocaleDateString など）には頼らず、UTC の
 * timestamp に +09:00 を足し引きして明示的に変換する。JST は DST が無い固定オフセット
 * なので、この算術だけで Intl 無しに再現性のある結果になる。
 *
 * 仕様:
 * - 日付キーは常に JST の YYYY-MM-DD 文字列。同じ書式なので文字列比較で前後を判定できる。
 * - 「放送日」は深夜アニメ慣習で JST 午前4時を境界にする（JST 00:00〜03:59 は前日扱い）。
 *   broadcast_room_overrides / ensure_broadcast_room_session の room_date と同じ基準。
 * - 週は日曜始まり。週間スケジュールの「今週」は「今日の放送日」を含む週。
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const LATE_NIGHT_BOUNDARY_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
	return value instanceof Date ? value : new Date(value);
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function utcDateKey(date: Date): string {
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** YYYY-MM-DD が実在する暦日かを TZ に依存せず判定する */
export function isDateKey(value: unknown): value is string {
	return typeof value === "string" && dateKeyToUtcMidnight(value) !== null;
}

/**
 * 日付キーを「その暦日の UTC 00:00」の Date に変換する。曜日や日数の加減算を
 * TZ 非依存で行うための中間表現で、実時刻（JST 00:00 の瞬間）ではない点に注意。
 */
export function dateKeyToUtcMidnight(value: string): Date | null {
	const match = value.match(DATE_KEY_PATTERN);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		Number.isNaN(date.getTime()) ||
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return date;
}

/** 瞬間 → JST の暦日キー（午前0時境界） */
export function jstDateKey(value: DateInput): string {
	return utcDateKey(new Date(toDate(value).getTime() + JST_OFFSET_MS));
}

/** 瞬間 → JST の放送日キー（午前4時境界: JST 00:00〜03:59 は前日） */
export function jstBroadcastDateKey(value: DateInput): string {
	return jstDateKey(toDate(value).getTime() - LATE_NIGHT_BOUNDARY_HOUR * 60 * 60 * 1000);
}

/** 日付キーの曜日（0=日曜 … 6=土曜）。不正なキーは null */
export function dateKeyWeekday(value: string): number | null {
	return dateKeyToUtcMidnight(value)?.getUTCDay() ?? null;
}

/** 日付キーに日数を加減算する（月・年跨ぎも UTC 算術で安全） */
export function addDaysToDateKey(value: string, days: number): string {
	const base = dateKeyToUtcMidnight(value);
	if (!base) throw new RangeError(`Invalid date key: ${value}`);
	return utcDateKey(new Date(base.getTime() + days * DAY_MS));
}

/** 日付キーを含む週の日曜日のキー */
export function startOfWeekDateKey(value: string): string {
	const weekday = dateKeyWeekday(value);
	if (weekday === null) throw new RangeError(`Invalid date key: ${value}`);
	return addDaysToDateKey(value, -weekday);
}

/**
 * JST の壁時計時刻を実時刻に変換する。hour は 24 以上（25:30 のような深夜表記）も
 * 翌日へ繰り越して受け付ける。
 */
export function jstWallClockToDate(dateKey: string, hour: number, minute = 0): Date | null {
	const base = dateKeyToUtcMidnight(dateKey);
	if (!base) return null;
	return new Date(base.getTime() - JST_OFFSET_MS + (hour * 60 + minute) * 60_000);
}

export interface JstWeekRange {
	/** 週の日曜日（日付キー） */
	start: string;
	/** 週の土曜日（日付キー、閉区間） */
	end: string;
	/** 週の最初の放送日が始まる瞬間（日曜 JST 04:00、閉区間） */
	startsAt: Date;
	/** 週の最後の放送日が終わる瞬間（翌日曜 JST 04:00、開区間） */
	endsAt: Date;
}

/**
 * 日曜始まりの週範囲。room_date の範囲 [start, end] と、放送日基準（午前4時境界）で
 * その週に属する実時刻の範囲 [startsAt, endsAt) が同じ 7 日間を指す。
 */
export function jstWeekRange(weekStartKey: string): JstWeekRange {
	const start = startOfWeekDateKey(weekStartKey);
	const end = addDaysToDateKey(start, 6);
	const startsAt = jstWallClockToDate(start, LATE_NIGHT_BOUNDARY_HOUR);
	const endsAt = jstWallClockToDate(addDaysToDateKey(start, 7), LATE_NIGHT_BOUNDARY_HOUR);
	if (!startsAt || !endsAt) throw new RangeError(`Invalid date key: ${weekStartKey}`);
	return { start, end, startsAt, endsAt };
}

/** 日付キーを「M/D」表記にする（表示用、TZ 非依存） */
export function formatDateKeyShort(value: string): string {
	const match = value.match(DATE_KEY_PATTERN);
	if (!match) return value;
	return `${Number(match[2])}/${Number(match[3])}`;
}
