import { fail, redirect } from "@sveltejs/kit";
import { createEventAction, toggleBroadcastSubscription, upsertBroadcastRoomMute } from "$lib/server/actions";
import {
	getActiveBroadcastRoomMuteAnimeIds,
	getAnimeList,
	getBroadcastNotificationSettings,
	getBroadcastRoomMutes,
	getBroadcastRoomOverridesForAnimeIds,
	getBroadcastSubscriptions,
	getEventsByRange,
	isAdminUser,
} from "$lib/server/queries";
import type {
	Anime,
	BroadcastNotificationSettings,
	BroadcastRoomMuteDuration,
	BroadcastRoomOverride,
	Event,
} from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function startOfWeek(date: Date) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - start.getDay());
	return start;
}

function addDays(date: Date, days: number) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function parseWeekStart(value: string | null) {
	if (!value) return startOfWeek(new Date());
	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return startOfWeek(new Date());
	return startOfWeek(parsed);
}

function toDateInputValue(date: Date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function toDateKey(value: string | null) {
	return value?.slice(0, 10) ?? null;
}

function isAnimeOnAirDate(anime: Anime, date: string) {
	const airedFrom = toDateKey(anime.aired_from);
	if (airedFrom && date < airedFrom) return false;

	const airedTo = toDateKey(anime.aired_to);
	if (airedTo && date > airedTo) return false;

	return true;
}

function broadcastTimeSortValue(value: string | null) {
	const match = value?.match(/^(\d{1,2}):([0-5]\d)/);
	if (!match) return Number.POSITIVE_INFINITY;
	return Number(match[1]) * 60 + Number(match[2]);
}

function overrideForDate(overrides: BroadcastRoomOverride[] | undefined, date: string): BroadcastRoomOverride | null {
	return overrides?.find((override) => override.room_date.slice(0, 10) === date) ?? null;
}

function effectiveBroadcastTime(
	anime: Anime,
	date: string,
	overrides: Record<string, BroadcastRoomOverride[]>,
): string | null {
	return overrideForDate(overrides[anime.id], date)?.broadcast_time ?? anime.broadcast_time;
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const today = startOfWeek(new Date());
	const minWeek = addDays(today, -35);
	const maxWeek = addDays(today, 35);
	const rawWeek = parseWeekStart(url.searchParams.get("week"));
	const weekStart = rawWeek < minWeek ? minWeek : rawWeek > maxWeek ? maxWeek : rawWeek;
	const weekEnd = addDays(weekStart, 7);
	weekEnd.setMilliseconds(-1);
	const scheduleRange = {
		start: toDateInputValue(weekStart),
		end: toDateInputValue(addDays(weekStart, 6)),
	};

	const [animeList, events, subscriptions, notificationSettings, mutedAnimeIds, roomMutes, isAdmin] =
		await Promise.all([
			getAnimeList(supabase, { scheduleRange, limit: 1000, userId: user?.id ?? null }),
			getEventsByRange(supabase, weekStart.toISOString(), weekEnd.toISOString()),
			user ? getBroadcastSubscriptions(supabase, user.id) : Promise.resolve([] as string[]),
			user
				? getBroadcastNotificationSettings(supabase, user.id)
				: Promise.resolve({
						notify_1min: true,
						notify_5min: true,
						notify_30min: false,
					} as BroadcastNotificationSettings),
			user ? getActiveBroadcastRoomMuteAnimeIds(supabase, user.id) : Promise.resolve(new Set<string>()),
			user ? getBroadcastRoomMutes(supabase, user.id) : Promise.resolve([]),
			user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
		]);

	const broadcastOverrides = await getBroadcastRoomOverridesForAnimeIds(
		supabase,
		animeList.map((anime) => anime.id),
	);

	const days: { date: string; label: string; anime: Anime[]; events: Event[] }[] = DAY_LABELS.map((label, index) => ({
		date: toDateInputValue(addDays(weekStart, index)),
		label,
		anime: [],
		events: [],
	}));

	for (const anime of animeList.filter((a): a is Anime & { broadcast_day: number } => a.broadcast_day != null)) {
		const day = days[anime.broadcast_day];
		if (day && isAnimeOnAirDate(anime, day.date)) {
			day.anime.push(anime);
		}
	}

	for (const anime of animeList) {
		for (const override of broadcastOverrides[anime.id] ?? []) {
			const date = override.room_date.slice(0, 10);
			if (date < scheduleRange.start || date > scheduleRange.end || !isAnimeOnAirDate(anime, date)) continue;

			const day = days.find((candidate) => candidate.date === date);
			if (day && !day.anime.some((scheduledAnime) => scheduledAnime.id === anime.id)) {
				day.anime.push(anime);
			}
		}
	}

	for (const event of events) {
		const day = new Date(event.scheduled_at).getDay();
		days[day]?.events.push(event);
	}

	for (const day of days) {
		day.anime.sort(
			(a, b) =>
				broadcastTimeSortValue(effectiveBroadcastTime(a, day.date, broadcastOverrides)) -
				broadcastTimeSortValue(effectiveBroadcastTime(b, day.date, broadcastOverrides)),
		);
		day.events.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
	}

	return {
		days,
		dayLabels: DAY_LABELS,
		events,
		user,
		isAdmin,
		subscriptions,
		mutedAnimeIds: [...mutedAnimeIds],
		roomMuteSettings: Object.fromEntries(roomMutes.map((mute) => [mute.anime_id, mute])),
		broadcastOverrides,
		notificationSettings,
		weekStart: toDateInputValue(weekStart),
		prevWeek: toDateInputValue(addDays(weekStart, -7)),
		nextWeek: toDateInputValue(addDays(weekStart, 7)),
		canGoPrev: weekStart > minWeek,
		canGoNext: weekStart < maxWeek,
		defaultScheduledAt: `${toDateInputValue(new Date())}T20:00`,
	};
};

function toMuteDuration(value: FormDataEntryValue | null): BroadcastRoomMuteDuration | null {
	if (value === "event_end") return value;
	const days = Number(value);
	return days >= 1 && days <= 7 && Number.isInteger(days) ? (days as 1 | 2 | 3 | 4 | 5 | 6 | 7) : null;
}

export const actions: Actions = {
	createEvent: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const result = await createEventAction(request, supabase, user.id);
		if ("success" in result && result.success) {
			redirect(303, `/events/${result.eventId}`);
		}
		return result;
	},

	toggleBroadcastNotification: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		if (!animeId) return fail(400, { message: "anime_idが必要です" });

		const result = await toggleBroadcastSubscription(supabase, user.id, animeId);
		return { toggleSuccess: true, subscribed: result.subscribed, animeId };
	},

	muteBroadcastRoom: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const roomDate = (form.get("room_date") as string | null)?.trim() ?? "";
		const duration = toMuteDuration(form.get("duration"));
		const repeatWeekly = form.get("repeat_weekly") === "true";
		if (!animeId || !roomDate) return fail(400, { message: "放送ルームが見つかりません" });
		if (!duration) return fail(400, { message: "ミュート期間を選択してください" });

		const result = await upsertBroadcastRoomMute(supabase, user.id, animeId, roomDate, duration, repeatWeekly);
		if ("status" in result) {
			return fail(result.status, { ...result.data, roomMuteError: true });
		}
		return result;
	},
};
