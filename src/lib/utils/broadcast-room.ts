import type { Anime, BroadcastRoomOverride } from "$lib/types";

export type BroadcastRoomOverridesByAnimeId = Record<string, BroadcastRoomOverride[]>;

export function roomDateKey(value: string): string {
	return value.slice(0, 10);
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
