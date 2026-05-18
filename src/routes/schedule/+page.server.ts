import { fail, redirect } from "@sveltejs/kit";
import { createEventAction } from "$lib/server/actions";
import { getAnimeList, getEventsByRange } from "$lib/server/queries";
import type { Anime, Event } from "$lib/types";
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

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const weekStart = parseWeekStart(url.searchParams.get("week"));
	const weekEnd = addDays(weekStart, 7);
	weekEnd.setMilliseconds(-1);

	const [animeList, events] = await Promise.all([
		getAnimeList(supabase, { status: "airing", limit: 1000, userId: user?.id ?? null }),
		getEventsByRange(supabase, weekStart.toISOString(), weekEnd.toISOString()),
	]);

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

	for (const event of events) {
		const day = new Date(event.scheduled_at).getDay();
		days[day]?.events.push(event);
	}

	for (const day of days) {
		day.anime.sort((a, b) => broadcastTimeSortValue(a.broadcast_time) - broadcastTimeSortValue(b.broadcast_time));
		day.events.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
	}

	return {
		days,
		dayLabels: DAY_LABELS,
		events,
		user,
		weekStart: toDateInputValue(weekStart),
		prevWeek: toDateInputValue(addDays(weekStart, -7)),
		nextWeek: toDateInputValue(addDays(weekStart, 7)),
		defaultScheduledAt: `${toDateInputValue(new Date())}T20:00`,
	};
};

export const actions: Actions = {
	createEvent: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const result = await createEventAction(request, supabase, user.id);
		if ("success" in result && result.success) {
			redirect(303, `/events/${result.eventId}`);
		}
		return result;
	},
};
