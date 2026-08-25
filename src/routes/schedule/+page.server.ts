import { fail, redirect } from "@sveltejs/kit";
import {
	createEventAction,
	removeAnimeMute,
	removeEventMuteAction,
	toggleBroadcastSubscription,
	toggleEventNotificationSubscription,
	updateEventMuteAction,
	upsertAnimeMute,
} from "$lib/server/actions";
import {
	getActiveAnimeMuteIds,
	getAnimeList,
	getAnimeMutes,
	getBroadcastNotificationSettings,
	getBroadcastRoomOverridesForAnimeIds,
	getBroadcastSubscriptions,
	getEventNotificationSubscriptions,
	getEventsByRange,
	getMutedEventIds,
	getOverrideAnimeIdsInRange,
	getScheduleBroadcastSessionsInRange,
	isAdminUser,
} from "$lib/server/queries";
import { jstBroadcastTimeLabel } from "$lib/syobocal-schedule";
import type { Anime, BroadcastNotificationSettings, BroadcastRoomOverride, Event } from "$lib/types";
import { formatBroadcastOverrideAnnouncement } from "$lib/utils/broadcast-episodes";
import {
	broadcastTimeSortValue,
	effectiveBroadcastTime,
	overrideForRoomDate,
	roomDateKey,
} from "$lib/utils/broadcast-room";
import { eventBroadcastDateKey } from "$lib/utils/event-time";
import type { Actions, PageServerLoad } from "./$types";

interface BroadcastAnnouncement {
	anime_id: string;
	title: string;
	cover_url: string | null;
	room_date: string;
	message: string;
	broadcast_time: string | null;
}

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

function announcementMessage(override: BroadcastRoomOverride): string {
	return formatBroadcastOverrideAnnouncement(override);
}

function pushAnnouncement(
	day: { announcements: BroadcastAnnouncement[] },
	anime: Anime,
	override: BroadcastRoomOverride,
	overrides: Record<string, BroadcastRoomOverride[]>,
) {
	if (day.announcements.some((announcement) => announcement.anime_id === anime.id)) return;
	const date = roomDateKey(override.room_date);
	day.announcements.push({
		anime_id: anime.id,
		title: anime.title,
		cover_url: anime.cover_url,
		room_date: date,
		message: announcementMessage(override),
		broadcast_time: effectiveBroadcastTime(anime, date, overrides[anime.id]),
	});
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
	const eventRangeEnd = new Date(weekEnd);
	eventRangeEnd.setHours(eventRangeEnd.getHours() + 4);
	const scheduleRange = {
		start: toDateInputValue(weekStart),
		end: toDateInputValue(addDays(weekStart, 6)),
	};

	// しょぼい絶対: 掲載対象は「同期済みセッションがある」か「オーバーライドがある」作品のみ
	const [sessions, overrideAnimeIdsInRange] = await Promise.all([
		getScheduleBroadcastSessionsInRange(supabase, scheduleRange.start, scheduleRange.end),
		getOverrideAnimeIdsInRange(supabase, scheduleRange.start, scheduleRange.end),
	]);
	const scheduleAnimeIds = [...new Set([...sessions.map((session) => session.anime_id), ...overrideAnimeIdsInRange])];

	const [
		animeList,
		events,
		subscriptions,
		notificationSettings,
		mutedAnimeIds,
		roomMutes,
		isAdmin,
		mutedEventIds,
		eventNotificationSubscriptions,
	] = await Promise.all([
		scheduleAnimeIds.length
			? getAnimeList(supabase, { ids: scheduleAnimeIds, limit: 1000, userId: user?.id ?? null })
			: Promise.resolve([] as Anime[]),
		getEventsByRange(supabase, weekStart.toISOString(), eventRangeEnd.toISOString()),
		user ? getBroadcastSubscriptions(supabase, user.id) : Promise.resolve([] as string[]),
		user
			? getBroadcastNotificationSettings(supabase, user.id)
			: Promise.resolve({
					notify_1min: true,
					notify_5min: true,
					notify_30min: false,
				} as BroadcastNotificationSettings),
		user ? getActiveAnimeMuteIds(supabase, user.id) : Promise.resolve(new Set<string>()),
		user ? getAnimeMutes(supabase, user.id) : Promise.resolve([]),
		user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
		user ? getMutedEventIds(supabase, user.id) : Promise.resolve(new Set<string>()),
		user ? getEventNotificationSubscriptions(supabase, user.id) : Promise.resolve([] as string[]),
	]);

	const broadcastOverrides = await getBroadcastRoomOverridesForAnimeIds(
		supabase,
		animeList.map((anime) => anime.id),
	);

	const days: {
		date: string;
		label: string;
		anime: Anime[];
		events: Event[];
		announcements: BroadcastAnnouncement[];
	}[] = DAY_LABELS.map((label, index) => ({
		date: toDateInputValue(addDays(weekStart, index)),
		label,
		anime: [],
		events: [],
		announcements: [],
	}));

	// しょぼい同期セッション: 実在の番組枠だけがカレンダーに載る
	const animeById = new Map(animeList.map((anime) => [Number(anime.id), anime]));
	for (const session of sessions) {
		const anime = animeById.get(session.anime_id);
		if (!anime || anime.room_type === "global") continue;
		const day = days.find((candidate) => candidate.date === session.room_date);
		if (!day) continue;
		const override = overrideForRoomDate(broadcastOverrides[anime.id], day.date);
		if (override?.is_cancelled) {
			pushAnnouncement(day, anime, override, broadcastOverrides);
			continue;
		}
		if (day.anime.some((scheduledAnime) => scheduledAnime.id === anime.id)) continue;
		// 掲載時刻はしょぼいの実枠（深夜は25:30のような24時間超表記で前日枠に載る）
		day.anime.push({
			...anime,
			broadcast_day: new Date(`${session.room_date}T00:00:00`).getDay(),
			broadcast_time: jstBroadcastTimeLabel(session.scheduled_at) ?? anime.broadcast_time,
		});
	}

	// 管理者オーバーライド: 休止は告知、それ以外はセッション未生成でも掲載する
	for (const anime of animeList) {
		if (anime.room_type === "global") continue;
		for (const override of broadcastOverrides[anime.id] ?? []) {
			const date = roomDateKey(override.room_date);
			if (date < scheduleRange.start || date > scheduleRange.end) continue;

			const day = days.find((candidate) => candidate.date === date);
			if (day && override.is_cancelled) {
				pushAnnouncement(day, anime, override, broadcastOverrides);
				continue;
			}
			if (day && !day.anime.some((scheduledAnime) => scheduledAnime.id === anime.id)) {
				day.anime.push(anime);
			}
		}
	}

	for (const event of events) {
		const date = eventBroadcastDateKey(event.scheduled_at);
		if (!date || date < scheduleRange.start || date > scheduleRange.end) continue;
		const day = days.find((candidate) => candidate.date === date);
		day?.events.push(event);
	}

	for (const day of days) {
		day.anime.sort(
			(a, b) =>
				broadcastTimeSortValue(effectiveBroadcastTime(a, day.date, broadcastOverrides[a.id])) -
				broadcastTimeSortValue(effectiveBroadcastTime(b, day.date, broadcastOverrides[b.id])),
		);
		day.announcements.sort(
			(a, b) => broadcastTimeSortValue(a.broadcast_time) - broadcastTimeSortValue(b.broadcast_time),
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
		mutedEventIds: [...mutedEventIds],
		eventNotificationSubscriptions,
		weekStart: toDateInputValue(weekStart),
		prevWeek: toDateInputValue(addDays(weekStart, -7)),
		nextWeek: toDateInputValue(addDays(weekStart, 7)),
		canGoPrev: weekStart > minWeek,
		canGoNext: weekStart < maxWeek,
		defaultScheduledAt: `${toDateInputValue(new Date())}T20:00`,
		defaultEventDate: eventBroadcastDateKey(new Date().toISOString()) ?? toDateInputValue(new Date()),
		defaultEventTime: "20:00",
	};
};

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
		const roomDate = (form.get("room_date") as string | null)?.trim() ?? null;
		const duration = form.get("duration") as string | null;
		const repeatWeekly = form.get("repeat_weekly") === "true";
		if (!animeId) return fail(400, { message: "放送ルームが見つかりません" });

		// Map legacy chip values to new anime_mutes schema.
		// repeat_weekly is an option for period mutes, not a separate "always" mode.
		const muteType = duration === "event_end" ? "always" : "period";
		const periodDays = muteType === "period" && duration ? Number(duration) : null;
		if (muteType === "period" && (periodDays == null || periodDays < 1 || periodDays > 7)) {
			return fail(400, { message: "ミュート期間を選択してください" });
		}

		const result = await upsertAnimeMute(
			supabase,
			user.id,
			animeId,
			muteType,
			periodDays,
			muteType === "period" && repeatWeekly,
			roomDate,
		);
		if ("status" in result) return fail(result.status, { ...result.data, roomMuteError: true });
		return result;
	},
	removeBroadcastRoomMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		if (!animeId) return fail(400, { message: "ミュート設定が見つかりません" });
		return removeAnimeMute(supabase, user.id, animeId);
	},

	updateEventMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return updateEventMuteAction(request, supabase, user.id);
	},

	removeEventMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeEventMuteAction(request, supabase, user.id);
	},

	toggleEventNotification: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
		if (!eventId) return fail(400, { message: "event_idが必要です" });

		const result = await toggleEventNotificationSubscription(supabase, user.id, eventId);
		return { eventToggleSuccess: true, subscribed: result.subscribed, eventId };
	},
};
