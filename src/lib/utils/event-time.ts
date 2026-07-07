const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const LATE_NIGHT_CUTOFF_HOUR = 4;
const MAX_EXTENDED_HOUR = 28;

export type ExtendedClockTime = {
	hour: number;
	minute: number;
};

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function utcDateKey(date: Date): string {
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function parseExtendedClockTime(value: string): ExtendedClockTime | null {
	const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour < 0 || hour > MAX_EXTENDED_HOUR) return null;
	if (hour === MAX_EXTENDED_HOUR && minute !== 0) return null;
	return { hour, minute };
}

export function eventScheduledAtIsoFromBroadcastInput(dateKey: string, timeValue: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
	const time = parseExtendedClockTime(timeValue);
	if (!time) return null;

	const base = new Date(`${dateKey}T00:00:00+09:00`);
	if (Number.isNaN(base.getTime())) return null;
	return new Date(base.getTime() + (time.hour * 60 + time.minute) * 60_000).toISOString();
}

export function eventJstDate(scheduledAtIso: string): Date | null {
	const date = new Date(scheduledAtIso);
	if (Number.isNaN(date.getTime())) return null;
	return new Date(date.getTime() + JST_OFFSET_MS);
}

export function eventBroadcastDateKey(scheduledAtIso: string): string | null {
	const jst = eventJstDate(scheduledAtIso);
	if (!jst) return null;
	if (jst.getUTCHours() < LATE_NIGHT_CUTOFF_HOUR) jst.setUTCDate(jst.getUTCDate() - 1);
	return utcDateKey(jst);
}

export function eventBroadcastMinutes(scheduledAtIso: string): number | null {
	const jst = eventJstDate(scheduledAtIso);
	if (!jst) return null;
	const hour = jst.getUTCHours();
	const minutes = hour * 60 + jst.getUTCMinutes();
	return hour < LATE_NIGHT_CUTOFF_HOUR ? minutes + MINUTES_PER_DAY : minutes;
}

export function eventBroadcastDateInputValue(scheduledAtIso: string): string {
	return eventBroadcastDateKey(scheduledAtIso) ?? "";
}

export function eventBroadcastTimeInputValue(scheduledAtIso: string): string {
	const jst = eventJstDate(scheduledAtIso);
	if (!jst) return "";
	const hour = jst.getUTCHours();
	const displayHour = hour < LATE_NIGHT_CUTOFF_HOUR ? hour + 24 : hour;
	return `${pad2(displayHour)}:${pad2(jst.getUTCMinutes())}`;
}
