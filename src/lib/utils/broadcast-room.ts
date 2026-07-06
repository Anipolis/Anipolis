import type { Anime, BroadcastRoomOverride } from "$lib/types";

export type BroadcastRoomOverridesByAnimeId = Record<string, BroadcastRoomOverride[]>;

interface BroadcastScheduleBounds {
	aired_from: string | null;
	aired_to: string | null;
	broadcast_day: number | null;
}

export function roomDateKey(value: string): string {
	return value.slice(0, 10);
}

function dateKeyToDate(value: string) {
	const dateKey = roomDateKey(value);
	const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (
		Number.isNaN(date.getTime()) ||
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

export function animeIsScheduledForRoomDate(
	anime: BroadcastScheduleBounds,
	dateKey: string,
	hasOverride = false,
): boolean {
	const roomDate = roomDateKey(dateKey);
	const date = dateKeyToDate(roomDate);
	if (!date) return false;
	if (!hasOverride && (anime.broadcast_day == null || date.getDay() !== anime.broadcast_day)) return false;

	const airedFrom = anime.aired_from?.slice(0, 10) ?? null;
	if (airedFrom && roomDate < airedFrom) return false;

	const airedTo = anime.aired_to?.slice(0, 10) ?? null;
	if (airedTo && roomDate > airedTo) return false;

	return true;
}

export function roomLiveKey(animeId: string, roomDate: string): string {
	return `${animeId}:${roomDate}`;
}

export function overrideForRoomDate(
	overrides: BroadcastRoomOverride[] | undefined,
	roomDate: string,
): BroadcastRoomOverride | null {
	return overrides?.find((override) => roomDateKey(override.room_date) === roomDate) ?? null;
}

export function effectiveBroadcastTime(
	anime: Anime,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): string | null {
	return overrideForRoomDate(overrides, roomDate)?.broadcast_time ?? anime.broadcast_time;
}

export function effectiveDurationMinutes(
	anime: Anime,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): number {
	const overrideDuration = overrideForRoomDate(overrides, roomDate)?.duration_minutes;
	return overrideDuration != null && overrideDuration > 0 ? overrideDuration : anime.broadcast_duration_minutes;
}

export function effectivePostCloseMinutes(
	anime: Anime,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): number {
	const overridePostClose = overrideForRoomDate(overrides, roomDate)?.post_close_minutes;
	return overridePostClose != null && overridePostClose >= 0
		? overridePostClose
		: anime.broadcast_room_post_close_minutes;
}

export function broadcastTimeMinutes(value: string | null): number | null {
	const match = value?.match(/^(\d{1,2}):([0-5]\d)/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

export function broadcastTimeSortValue(value: string | null): number {
	return broadcastTimeMinutes(value) ?? Number.POSITIVE_INFINITY;
}

export function minutesUntilBroadcast(
	anime: Anime,
	now: Date,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): number | null {
	const broadcastTime = effectiveBroadcastTime(anime, roomDate, overrides);
	const minutes = broadcastTimeMinutes(broadcastTime);
	if (minutes == null) return null;

	const scheduledAt = new Date(`${roomDate}T00:00:00`);
	scheduledAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
	return Math.round((scheduledAt.getTime() - now.getTime()) / 60_000);
}

export function liveWindowMinutes(
	anime: Anime,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): number {
	const durationMinutes = effectiveDurationMinutes(anime, roomDate, overrides);
	const postCloseMinutes = effectivePostCloseMinutes(anime, roomDate, overrides);
	return (durationMinutes > 0 ? durationMinutes : 30) + (postCloseMinutes >= 0 ? postCloseMinutes : 30);
}

export function isRoomLive(
	anime: Anime,
	now: Date,
	roomDate: string,
	overrides: BroadcastRoomOverride[] | undefined,
): boolean {
	const mins = minutesUntilBroadcast(anime, now, roomDate, overrides);
	return mins !== null && mins <= 0 && mins > -liveWindowMinutes(anime, roomDate, overrides);
}
