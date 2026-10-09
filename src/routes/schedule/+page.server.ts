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
	animeIsScheduledForRoomDate,
	broadcastTimeSortValue,
	effectiveBroadcastTime,
	isEligibleForRoomLog,
	overrideForRoomDate,
	roomDateKey,
} from "$lib/utils/broadcast-room";
import { eventBroadcastDateKey } from "$lib/utils/event-time";
import {
	addDaysToDateKey,
	dateKeyWeekday,
	isDateKey,
	jstBroadcastDateKey,
	jstDateKey,
	jstWeekRange,
	startOfWeekDateKey,
} from "$lib/utils/jst";
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

/** 週ナビゲーションで遡れる/進める範囲（今週の日曜から前後 5 週） */
const WEEK_NAV_RANGE_DAYS = 35;

/**
 * week クエリを TZ 非依存の YYYY-MM-DD として検証し、その週の日曜キーへ丸める。
 * 書式不正・実在しない日付は「今週」にフォールバックする。
 */
function parseWeekStart(value: string | null, currentWeekStart: string): string {
	if (!isDateKey(value)) return currentWeekStart;
	return startOfWeekDateKey(value);
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

	// 週間スケジュールの時間基準は JST 固定・放送日は午前4時境界（$lib/utils/jst 参照）。
	// Cloudflare Workers のサーバー TZ は UTC なので Date のローカル getter は使わず、
	// 「今日」「今週」「日付キー」「イベント取得範囲」をすべて同じ基準から導出する。
	// 「今週」は今日の放送日を含む週: JST 日曜 00:00〜03:59 はまだ土曜の放送日なので
	// 前週を表示し、クライアント側の既定タブ（土曜）と食い違わないようにする。
	const now = new Date();
	const todayKey = jstBroadcastDateKey(now);
	const currentWeekStart = startOfWeekDateKey(todayKey);
	const minWeek = addDaysToDateKey(currentWeekStart, -WEEK_NAV_RANGE_DAYS);
	const maxWeek = addDaysToDateKey(currentWeekStart, WEEK_NAV_RANGE_DAYS);
	const rawWeek = parseWeekStart(url.searchParams.get("week"), currentWeekStart);
	const weekStart = rawWeek < minWeek ? minWeek : rawWeek > maxWeek ? maxWeek : rawWeek;
	// room_date の範囲 [start, end] とイベント取得範囲 [startsAt, endsAt) は同じ 7 放送日を指す
	const week = jstWeekRange(weekStart);
	const scheduleRange = { start: week.start, end: week.end };

	// しょぼい絶対: 今日以降の掲載対象は「同期済みセッションがある」か「オーバーライド
	// がある」作品のみ。過去日はしょぼい番組データが残らないため、ルームページの
	// 合成表示と同じルール（対象シーズン+曜日・放送期間）で履歴として掲載する。
	// 「今日」は上の todayKey（JST・午前4時境界、broadcast-episode-log と同じ基準）
	const hasPastDays = scheduleRange.start < todayKey;
	const [sessions, overrideAnimeIdsInRange, pastFillList] = await Promise.all([
		getScheduleBroadcastSessionsInRange(supabase, scheduleRange.start, scheduleRange.end),
		getOverrideAnimeIdsInRange(supabase, scheduleRange.start, scheduleRange.end),
		hasPastDays
			? getAnimeList(supabase, { scheduleRange, limit: 1000, userId: user?.id ?? null })
			: Promise.resolve([] as Anime[]),
	]);
	const pastFillIds = new Set(pastFillList.map((anime) => Number(anime.id)));
	const scheduleAnimeIds = [
		...new Set([...sessions.map((session) => session.anime_id), ...overrideAnimeIdsInRange]),
	].filter((id) => !pastFillIds.has(id));

	const [
		sessionAnimeList,
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
		// endsAt は開区間なので lte に渡す前に 1ms 戻す
		getEventsByRange(supabase, week.startsAt.toISOString(), new Date(week.endsAt.getTime() - 1).toISOString()),
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

	// セッション/オーバーライド由来と過去日補完の作品リストを統合
	const animeList: Anime[] = [...pastFillList];
	{
		const known = new Set(animeList.map((anime) => anime.id));
		for (const anime of sessionAnimeList) {
			if (!known.has(anime.id)) animeList.push(anime);
		}
	}

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
		date: addDaysToDateKey(weekStart, index),
		label,
		anime: [],
		events: [],
		announcements: [],
	}));

	// しょぼい同期セッション: 実在の番組枠だけがカレンダーに載る
	// 話数もしょぼい番組表由来の値が第一（長期作品は休止・特番で週次カウントが
	// ずれるため、曜日からの機械カウントはセッションに番号が無い場合の補完のみ）
	const sessionEpisodeNumbers: Record<string, number> = {};
	// 話数異常で番号を外したセッション。週次カウントによる補完も行わず、話数バッジを出さない（#246）
	const suppressedEpisodeKeys: string[] = [];
	for (const session of sessions) {
		const key = `${session.anime_id}:${session.room_date}`;
		if (session.episode_number != null) {
			sessionEpisodeNumbers[key] = session.episode_number;
		} else if (session.episode_suppressed) {
			suppressedEpisodeKeys.push(key);
		}
	}
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
			broadcast_day: dateKeyWeekday(session.room_date) ?? anime.broadcast_day,
			broadcast_time: jstBroadcastTimeLabel(session.scheduled_at) ?? anime.broadcast_time,
		});
	}

	// 過去日の履歴掲載: しょぼいの番組データは過去に遡れないため、セッションが
	// 残っていない過去日はルームページの合成表示と同じルール（対象シーズン+
	// 曜日・放送期間ゲート）で補完する。今日以降はしょぼい絶対のまま。
	for (const day of days) {
		if (day.date >= todayKey) continue;
		for (const anime of pastFillList) {
			if (anime.room_type === "global") continue;
			if (!isEligibleForRoomLog(anime.season)) continue;
			if (!animeIsScheduledForRoomDate(anime, day.date, false)) continue;
			const override = overrideForRoomDate(broadcastOverrides[anime.id], day.date);
			if (override?.is_cancelled) {
				pushAnnouncement(day, anime, override, broadcastOverrides);
				continue;
			}
			if (!day.anime.some((scheduledAnime) => scheduledAnime.id === anime.id)) day.anime.push(anime);
		}
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
		sessionEpisodeNumbers,
		suppressedEpisodeKeys,
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
		weekStart,
		prevWeek: addDaysToDateKey(weekStart, -7),
		nextWeek: addDaysToDateKey(weekStart, 7),
		canGoPrev: weekStart > minWeek,
		canGoNext: weekStart < maxWeek,
		defaultScheduledAt: `${jstDateKey(now)}T20:00`,
		defaultEventDate: eventBroadcastDateKey(now.toISOString()) ?? todayKey,
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
