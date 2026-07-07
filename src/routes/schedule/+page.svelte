<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { Anime, BroadcastRoomOverride } from "$lib/types";
import {
	type BroadcastEpisodeSlot,
	formatMarathonBadge,
	isMarathonEpisodeSlot,
	resolveBroadcastEpisodeSlot,
} from "$lib/utils/broadcast-episodes";
import {
	broadcastTimeMinutes,
	effectiveBroadcastTime as resolveEffectiveBroadcastTime,
	isRoomLive as resolveIsRoomLive,
	minutesUntilBroadcast as resolveMinutesUntilBroadcast,
	roomLiveKey,
} from "$lib/utils/broadcast-room";
import { eventBroadcastMinutes, eventBroadcastTimeInputValue } from "$lib/utils/event-time";
import type { ActionData, PageProps } from "./$types";

let { data, form }: PageProps & { form: ActionData } = $props();

interface AnimeSearchResult {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
}

let showEventDialog = $state(false);
let openAlertMenu = $state<string | null>(null);
let eventAnimeQuery = $state("");
let eventAnimeResults = $state<AnimeSearchResult[]>([]);
let eventAnimeSearching = $state(false);
let selectedEventAnime = $state<AnimeSearchResult | null>(null);
let eventAnimeSearchDebounce: ReturnType<typeof setTimeout> | null = null;

// Notification subscription state — optimistic, keyed by anime.id
let subscribedIds = $state(new Set<string>(untrack(() => data.subscriptions)));
let mutedAnimeIds = $state(new Set<string>(untrack(() => data.mutedAnimeIds)));
let roomMuteSettings = $state(untrack(() => data.roomMuteSettings));

// Event mute / notification state — optimistic, keyed by event.id
let mutedEventIds = $state(new Set<string>(untrack(() => data.mutedEventIds)));
let eventSubscribedIds = $state(new Set<string>(untrack(() => data.eventNotificationSubscriptions)));

// Which anime are currently in their notification window (client-side highlight)
let notifyingIds = $state(new Set<string>());

// Which anime rooms are currently live, keyed by anime + room date.
let liveRoomKeys = $state(new Set<string>());

function getDefaultDayIndex(): number {
	return getCurrentBroadcastDate().getDay();
}
function getDisplayDayOrder(): number[] {
	return data.days.map((_, index) => index);
}

function getCurrentBroadcastDate(now = new Date()): Date {
	const date = new Date(now);
	// Late-night broadcasts through 28:00 (04:00 next day) belong to the previous broadcast date.
	if (date.getHours() < 4) date.setDate(date.getDate() - 1);
	return date;
}

function getDisplayDayItems() {
	return getDisplayDayOrder()
		.map((dayIdx) => {
			const day = data.days[dayIdx];
			if (!day) return null;
			return {
				dayIdx,
				day,
				date: day.date,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);
}

let selectedDayIndex = $state(getDefaultDayIndex());
let dayTabBar = $state<HTMLElement | null>(null);

$effect(() => {
	const idx = selectedDayIndex;
	if (!dayTabBar) return;
	const displayPos = getDisplayDayOrder().indexOf(idx);
	const tabs = dayTabBar.querySelectorAll<HTMLElement>(".day-tab");
	const activeTab = tabs[displayPos];
	if (!activeTab) return;
	const barRect = dayTabBar.getBoundingClientRect();
	const tabRect = activeTab.getBoundingClientRect();
	const tabCenterInBar = tabRect.left - barRect.left + dayTabBar.scrollLeft + tabRect.width / 2;
	dayTabBar.scrollLeft = Math.max(0, tabCenterInBar - barRect.width / 2);
});

const DAY_BG = ["#fff1f0", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#eff8ff"];
const DAY_COLOR = ["#dc2626", "#334155", "#334155", "#334155", "#334155", "#334155", "#2563eb"];

$effect(() => {
	if (form && "message" in form && !("roomMuteError" in form)) showEventDialog = true;
});

// Sync subscriptions when server data refreshes
$effect(() => {
	subscribedIds = new Set<string>(data.subscriptions);
	mutedAnimeIds = new Set<string>(data.mutedAnimeIds);
	roomMuteSettings = data.roomMuteSettings;
	mutedEventIds = new Set<string>(data.mutedEventIds);
	eventSubscribedIds = new Set<string>(data.eventNotificationSubscriptions);
});

function formatDate(value: string) {
	return new Date(`${value}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatShortDate(value: string): string {
	const d = new Date(`${value}T00:00:00`);
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(iso: string) {
	return eventBroadcastTimeInputValue(iso);
}

/** イベント開始時刻の JST での「0時からの経過分」。アニメの broadcast_time との時刻順ソートに使う */
function eventMinutesInJst(iso: string): number {
	return eventBroadcastMinutes(iso) ?? Number.MAX_SAFE_INTEGER;
}

function openEventDialog() {
	showEventDialog = true;
	eventAnimeQuery = "";
	eventAnimeResults = [];
	eventAnimeSearching = false;
	selectedEventAnime = null;
}

function selectEventAnime(anime: AnimeSearchResult) {
	selectedEventAnime = anime;
	eventAnimeQuery = "";
	eventAnimeResults = [];
}

function clearEventAnime() {
	selectedEventAnime = null;
	eventAnimeQuery = "";
	eventAnimeResults = [];
}

function handleEventAnimeQueryInput() {
	if (eventAnimeSearchDebounce) clearTimeout(eventAnimeSearchDebounce);
	if (eventAnimeQuery.trim().length === 0) {
		eventAnimeResults = [];
		eventAnimeSearching = false;
		return;
	}
	eventAnimeSearchDebounce = setTimeout(async () => {
		const query = eventAnimeQuery.trim();
		eventAnimeSearching = true;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(query)}`);
			const results = res.ok ? await res.json() : [];
			if (eventAnimeQuery.trim() === query) eventAnimeResults = results;
		} catch {
			if (eventAnimeQuery.trim() === query) eventAnimeResults = [];
		}
		if (eventAnimeQuery.trim() === query) eventAnimeSearching = false;
	}, 300);
}

function effectiveBroadcastTime(anime: Anime, dateStr: string): string | null {
	return resolveEffectiveBroadcastTime(anime, dateStr, data.broadcastOverrides[anime.id]);
}

type ScheduleDayEvent = (typeof data.days)[number]["events"][number];

type ScheduleItem =
	| { type: "anime"; anime: Anime }
	| { type: "event"; event: ScheduleDayEvent }
	| {
			type: "suspension";
			anime_id: string;
			title: string;
			room_date: string;
			message: string;
			broadcast_time: string | null;
	  };

function getScheduleItems(day: (typeof data.days)[number], dateStr: string): ScheduleItem[] {
	return [
		...day.anime.map((anime): ScheduleItem => ({ type: "anime", anime })),
		...day.events.map((event): ScheduleItem => ({ type: "event", event })),
		...day.announcements.map((announcement): ScheduleItem => ({ type: "suspension", ...announcement })),
	].sort(
		(a, b) =>
			(scheduleItemMinutes(a, dateStr) ?? Number.MAX_SAFE_INTEGER) -
			(scheduleItemMinutes(b, dateStr) ?? Number.MAX_SAFE_INTEGER),
	);
}
function scheduleItemMinutes(item: ScheduleItem, dateStr: string): number | null {
	if (item.type === "event") {
		return eventMinutesInJst(item.event.scheduled_at);
	}
	const time = item.type === "anime" ? effectiveBroadcastTime(item.anime, dateStr) : item.broadcast_time;
	return broadcastTimeMinutes(time);
}

function groupScheduleItemsByTimeBand(day: (typeof data.days)[number], dateStr: string): ScheduleItem[][] {
	const groups: ScheduleItem[][] = [];
	for (const item of getScheduleItems(day, dateStr)) {
		const currentGroup = groups.at(-1);
		const previousItem = currentGroup?.at(-1);
		const minutes = scheduleItemMinutes(item, dateStr);
		const previousMinutes = previousItem ? scheduleItemMinutes(previousItem, dateStr) : null;
		if (currentGroup && minutes !== null && previousMinutes !== null && Math.abs(minutes - previousMinutes) <= 10) {
			currentGroup.push(item);
		} else {
			groups.push([item]);
		}
	}
	return groups;
}

function minutesUntilBroadcast(anime: Anime, now: Date, roomDate: string): number | null {
	return resolveMinutesUntilBroadcast(anime, now, roomDate, data.broadcastOverrides[anime.id]);
}

function isRoomLive(anime: Anime, now: Date, roomDate: string): boolean {
	return resolveIsRoomLive(anime, now, roomDate, data.broadcastOverrides[anime.id]);
}

function getMaxNotifyWindow(): number {
	const s = data.notificationSettings;
	return Math.max(s.notify_1min ? 1 : 0, s.notify_5min ? 5 : 0, s.notify_30min ? 30 : 0);
}

function refreshNotifyingIds() {
	const now = new Date();
	const maxWindow = getMaxNotifyWindow();
	if (maxWindow === 0) {
		notifyingIds = new Set();
		return;
	}

	const next = new Set<string>();
	for (const day of data.days) {
		for (const anime of day.anime) {
			if (!subscribedIds.has(anime.id)) continue;
			const mins = minutesUntilBroadcast(anime, now, day.date);
			if (mins !== null && mins >= 0 && mins <= maxWindow) {
				next.add(anime.id);
			}
		}
	}
	notifyingIds = next;
}

function refreshLiveIds() {
	const now = new Date();
	const next = new Set<string>();
	for (const day of data.days) {
		for (const anime of day.anime) {
			if (isRoomLive(anime, now, day.date)) next.add(roomLiveKey(anime.id, day.date));
		}
	}
	liveRoomKeys = next;
}

// Check every 30 seconds
$effect(() => {
	refreshNotifyingIds();
	refreshLiveIds();
	const id = setInterval(() => {
		refreshNotifyingIds();
		refreshLiveIds();
	}, 30_000);
	return () => clearInterval(id);
});

// Optimistic toggle — update local state before server responds
const notifySubmit: SubmitFunction = ({ formData }) => {
	openAlertMenu = null;
	const animeId = formData.get("anime_id") as string;
	const wasSubscribed = subscribedIds.has(animeId);
	if (wasSubscribed) {
		subscribedIds.delete(animeId);
		subscribedIds = new Set(subscribedIds);
	} else {
		subscribedIds.add(animeId);
		subscribedIds = new Set(subscribedIds);
	}
	return async ({ result, update }) => {
		if (result.type === "failure") {
			// Rollback on failure
			if (wasSubscribed) {
				subscribedIds.add(animeId);
			} else {
				subscribedIds.delete(animeId);
			}
			subscribedIds = new Set(subscribedIds);
		}
		await update({ reset: false });
	};
};

const muteSubmit: SubmitFunction = ({ formData }) => {
	openAlertMenu = null;
	const animeId = formData.get("anime_id") as string;
	const duration = formData.get("duration") as string | null;
	const repeatWeekly = formData.get("repeat_weekly") === "true";
	const previousMutedAnimeIds = new Set(mutedAnimeIds);
	const previousRoomMuteSettings = roomMuteSettings;
	const muteType = duration === "event_end" ? "always" : "period";
	const periodDays = muteType === "period" ? Number(duration ?? 3) : null;
	mutedAnimeIds.add(animeId);
	mutedAnimeIds = new Set(mutedAnimeIds);
	roomMuteSettings = {
		...roomMuteSettings,
		[animeId]: {
			id: roomMuteSettings[animeId]?.id ?? `pending-${animeId}`,
			anime_id: animeId,
			anime_title: roomMuteSettings[animeId]?.anime_title ?? "",
			anime_cover_url: roomMuteSettings[animeId]?.anime_cover_url ?? null,
			mute_type: muteType,
			period_days: periodDays,
			is_repeat: muteType === "period" && repeatWeekly,
			muted_until: roomMuteSettings[animeId]?.muted_until ?? null,
			created_at: roomMuteSettings[animeId]?.created_at ?? new Date().toISOString(),
		},
	};
	return async ({ result, update }) => {
		if (result.type === "failure") {
			mutedAnimeIds = previousMutedAnimeIds;
			roomMuteSettings = previousRoomMuteSettings;
			return;
		}
		await update({ reset: false });
	};
};

const removeSubmit: SubmitFunction = ({ formData }) => {
	openAlertMenu = null;
	const animeId = formData.get("anime_id") as string;
	const previousMutedAnimeIds = new Set(mutedAnimeIds);
	const previousRoomMuteSettings = roomMuteSettings;
	mutedAnimeIds.delete(animeId);
	mutedAnimeIds = new Set(mutedAnimeIds);
	const { [animeId]: _removed, ...nextRoomMuteSettings } = roomMuteSettings;
	roomMuteSettings = nextRoomMuteSettings;
	return async ({ result, update }) => {
		if (result.type === "failure") {
			mutedAnimeIds = previousMutedAnimeIds;
			roomMuteSettings = previousRoomMuteSettings;
			return;
		}
		await update({ reset: false });
	};
};

function alertKey(animeId: string, date: string) {
	return `${animeId}:${date}`;
}

function eventAlertKey(eventId: string) {
	return `event:${eventId}`;
}

// Optimistic on/off toggle for event notifications — mirrors notifySubmit (anime bell menu)
const eventNotifySubmit: SubmitFunction = ({ formData }) => {
	openAlertMenu = null;
	const eventId = formData.get("event_id") as string;
	const wasSubscribed = eventSubscribedIds.has(eventId);
	if (wasSubscribed) {
		eventSubscribedIds.delete(eventId);
	} else {
		eventSubscribedIds.add(eventId);
	}
	eventSubscribedIds = new Set(eventSubscribedIds);
	return async ({ result, update }) => {
		if (result.type === "failure") {
			if (wasSubscribed) {
				eventSubscribedIds.add(eventId);
			} else {
				eventSubscribedIds.delete(eventId);
			}
			eventSubscribedIds = new Set(eventSubscribedIds);
		}
		await update({ reset: false });
	};
};

// Optimistic on/off toggle for event mute — the form's action switches between
// updateEventMute / removeEventMute based on current state
const eventMuteToggleSubmit: SubmitFunction = ({ formData }) => {
	openAlertMenu = null;
	const eventId = formData.get("event_id") as string;
	const wasMuted = mutedEventIds.has(eventId);
	if (wasMuted) {
		mutedEventIds.delete(eventId);
	} else {
		mutedEventIds.add(eventId);
	}
	mutedEventIds = new Set(mutedEventIds);
	return async ({ result, update }) => {
		if (result.type === "failure") {
			if (wasMuted) {
				mutedEventIds.add(eventId);
			} else {
				mutedEventIds.delete(eventId);
			}
			mutedEventIds = new Set(mutedEventIds);
		}
		await update({ reset: false });
	};
};

// Check if anime status allows notifications (airing or upcoming only)
function canSubscribe(anime: Anime): boolean {
	const s = anime.computed_broadcast_status ?? anime.status;
	return s === "airing" || s === "upcoming";
}

function currentEpisodeForSlot(
	anime: Anime,
	dateStr: string,
	overrides: BroadcastRoomOverride[] = [],
): BroadcastEpisodeSlot | null {
	if (!anime.aired_from) return null;
	return resolveBroadcastEpisodeSlot({
		date: dateStr,
		airedFrom: anime.aired_from,
		airedTo: anime.aired_to ?? null,
		broadcastDay: anime.broadcast_day,
		broadcastTime: anime.broadcast_time,
		episodeCount: anime.episode_count,
		overrides,
	});
}

function formatEpisodeBadge(ep: BroadcastEpisodeSlot, total: string | null): string {
	if (ep.start == null || ep.end == null) return ep.label ?? "";
	const value = ep.start === ep.end ? String(ep.start) : `${ep.start}-${ep.end}`;
	return total ? `${value}/${total}` : value;
}
</script>

<svelte:head> <title>放送スケジュール - Anipolis</title> </svelte:head>

<div class="schedule-page">
	<header class="schedule-header">
		<div>
			<h1>放送スケジュール</h1>
		</div>
		<div class="schedule-actions">
			<div class="week-nav">
				{#if data.canGoPrev}
					<a class="week-nav-btn" href="/schedule?week={data.prevWeek}" aria-label="前の週">
						<span class="i-lucide-chevron-left" aria-hidden="true"></span>
						前週
					</a>
				{:else}
					<span class="week-nav-btn week-nav-btn--disabled" aria-disabled="true">
						<span class="i-lucide-chevron-left" aria-hidden="true"></span>
						前週
					</span>
				{/if}
				<h1 class="mobile-schedule-title">放送スケジュール</h1>
				{#if data.canGoNext}
					<a class="week-nav-btn" href="/schedule?week={data.nextWeek}" aria-label="次の週">
						翌週
						<span class="i-lucide-chevron-right" aria-hidden="true"></span>
					</a>
				{:else}
					<span class="week-nav-btn week-nav-btn--disabled" aria-disabled="true">
						翌週
						<span class="i-lucide-chevron-right" aria-hidden="true"></span>
					</span>
				{/if}
			</div>
			{#if data.isAdmin}
				<button
					type="button"
					class="btn btn-primary create-event-btn"
					onclick={openEventDialog}
					aria-label="イベント作成"
				>
					<span class="i-lucide-calendar-plus" aria-hidden="true"></span>
					<span class="create-event-label">イベント作成</span>
				</button>
			{/if}
		</div>
	</header>

	{#if form && "roomMuteError" in form && "message" in form}
		<p class="form-error schedule-flash">{form.message}</p>
	{/if}

	<div class="day-tab-bar" aria-label="日付選択" bind:this={dayTabBar}>
		{#each getDisplayDayItems() as item}
			<button
				type="button"
				class="day-tab"
				class:day-tab--active={selectedDayIndex === item.dayIdx}
				onclick={() => (selectedDayIndex = item.dayIdx)}
				aria-pressed={selectedDayIndex === item.dayIdx}
			>
				<span class="day-tab-label" style="color: {DAY_COLOR[item.dayIdx]}">{item.day.label}</span>
				<span class="day-tab-date">{formatShortDate(item.date)}</span>
			</button>
		{/each}
	</div>

	<div class="schedule-grid">
		{#each data.days as day, d}
			{@const displayDate = day.date}
			<div class="day-col" class:day-col--selected={d === selectedDayIndex}>
				<div class="day-heading" style="color: {DAY_COLOR[d]}; background: {DAY_BG[d]}">
					<span>{day.label}曜日</span>
					<time>{formatDate(displayDate)}</time>
				</div>
				<div class="day-slots">
					{#if day.events.length === 0 && day.announcements.length === 0 && day.anime.length === 0}
						<p class="empty-day">なし</p>
					{:else}
						{#snippet eventSlot(event: ScheduleDayEvent)}
							{@const eventMuted = mutedEventIds.has(event.id)}
							{@const eventSubscribed = eventSubscribedIds.has(event.id)}
							<div
								class="event-slot-wrap"
								class:event-slot-wrap--menu-open={openAlertMenu === eventAlertKey(event.id)}
							>
								<a
									href="/events/{event.id}"
									class="event-slot"
									class:event-slot--cancelled={event.is_cancelled}
								>
									<div class="slot-cover-wrap">
										{#if event.anime?.cover_url}
											<img src={event.anime.cover_url} alt={event.anime.title} class="slot-cover">
										{:else}
											<div class="slot-cover slot-cover--event-placeholder">
												<span class="i-lucide-calendar-days" aria-hidden="true"></span>
											</div>
										{/if}
									</div>
									<div class="slot-info">
										<div class="slot-meta-row">
											<span class="slot-time slot-time--event"
												>{formatTime(event.scheduled_at)}</span
											>
											<span class="slot-kind slot-kind--event">EVENT</span>
										</div>
										<span class="slot-title">{event.title}</span>
										<span class="slot-bottom"
											>{[event.anime?.title, `#${event.hashtag}`].filter(Boolean).join(" ・ ")}</span
										>
									</div>
								</a>
								{#if data.user}
									<div class="room-alert-control">
										<button
											type="button"
											class="notify-btn"
											class:notify-btn--active={eventSubscribed}
											class:notify-btn--muted={eventMuted}
											title={eventMuted ? "ミュート中。通知またはミュートを設定" : "通知またはミュートを設定"}
											aria-label={eventMuted ? "ミュート中。通知またはミュートを設定" : "通知またはミュートを設定"}
											aria-expanded={openAlertMenu === eventAlertKey(event.id)}
											onclick={() => {
											const key = eventAlertKey(event.id);
											openAlertMenu = openAlertMenu === key ? null : key;
										}}
										>
											{#if eventMuted}
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<path d="M10.268 21a2 2 0 0 0 3.464 0" />
													<path d="M17 17H4s3-2 3-9a5 5 0 0 1 .6-2.4" />
													<path d="M9.3 3.3A6 6 0 0 1 18 8c0 2.2.3 3.9.8 5.2" />
													<path d="m2 2 20 20" />
												</svg>
											{:else if eventSubscribed}
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="currentColor"
													stroke="currentColor"
													stroke-width="1"
													aria-hidden="true"
												>
													<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
													<path d="M13.73 21a2 2 0 0 1-3.46 0" />
												</svg>
											{:else}
												<svg
													width="13"
													height="13"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
													<path d="M13.73 21a2 2 0 0 1-3.46 0" />
												</svg>
											{/if}
										</button>
									</div>
									{#if openAlertMenu === eventAlertKey(event.id)}
										<button
											type="button"
											class="alert-menu-backdrop"
											tabindex="-1"
											aria-label="閉じる"
											onclick={() => (openAlertMenu = null)}
										></button>
										<div class="room-alert-menu" aria-label="イベント設定">
											{#if !event.is_cancelled}
												<form
													method="POST"
													action="?/toggleEventNotification"
													use:enhance={eventNotifySubmit}
												>
													<input type="hidden" name="event_id" value={event.id}>
													<button
														type="submit"
														class="notify-toggle"
														class:notify-toggle--on={eventSubscribed}
													>
														{#if eventSubscribed}
															<svg
																width="13"
																height="13"
																viewBox="0 0 24 24"
																fill="currentColor"
																stroke="currentColor"
																stroke-width="1"
																aria-hidden="true"
															>
																<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
																<path d="M13.73 21a2 2 0 0 1-3.46 0" />
															</svg>
														{:else}
															<svg
																width="13"
																height="13"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"
																aria-hidden="true"
															>
																<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
																<path d="M13.73 21a2 2 0 0 1-3.46 0" />
															</svg>
														{/if}
														<span class="notify-toggle-label"
															>{eventSubscribed ? "通知オン" : "通知オフ"}</span
														>
														<span class="notify-toggle-switch">
															<span
																class="notify-toggle-knob"
																class:notify-toggle-knob--on={eventSubscribed}
															></span>
														</span>
													</button>
												</form>
												<div class="menu-divider"></div>
											{/if}
											<form
												method="POST"
												action={eventMuted ? "?/removeEventMute" : "?/updateEventMute"}
												use:enhance={eventMuteToggleSubmit}
											>
												<input type="hidden" name="event_id" value={event.id}>
												<button
													type="submit"
													class="notify-toggle"
													class:notify-toggle--on={eventMuted}
												>
													<svg
														width="13"
														height="13"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														aria-hidden="true"
													>
														<path d="M10.268 21a2 2 0 0 0 3.464 0" />
														<path d="M17 17H4s3-2 3-9a5 5 0 0 1 .6-2.4" />
														<path d="M9.3 3.3A6 6 0 0 1 18 8c0 2.2.3 3.9.8 5.2" />
														<path d="m2 2 20 20" />
													</svg>
													<span class="notify-toggle-label"
														>{eventMuted ? "ミュート中" : "ミュートオフ"}</span
													>
													<span class="notify-toggle-switch">
														<span
															class="notify-toggle-knob"
															class:notify-toggle-knob--on={eventMuted}
														></span>
													</span>
												</button>
											</form>
											<div class="menu-settings-link">
												<a href="/settings/mutes" class="menu-settings-link-anchor">
													<span class="i-lucide-settings-2" aria-hidden="true"></span>
													ミュート設定を管理
												</a>
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{/snippet}

						{#each groupScheduleItemsByTimeBand(day, displayDate) as itemGroup, groupIndex (groupIndex)}
							<div class="anime-time-group">
								{#each itemGroup as item (item.type === "anime" ? item.anime.id : item.type === "event" ? item.event.id : `suspension-${item.anime_id}-${item.room_date}`)}
									{#if item.type === "event"}
										{@render eventSlot(item.event)}
									{:else if item.type === "suspension"}
										<div class="anime-slot-wrap anime-slot-wrap--suspension" role="note">
											<div class="anime-slot anime-slot--suspension">
												<div class="slot-cover-wrap">
													<div class="slot-cover slot-cover--suspension" aria-hidden="true">
														<span>休</span>
														<span>止</span>
													</div>
												</div>
												<div class="slot-info slot-info--suspension">
													<div class="slot-meta-row slot-meta-row--suspension">
														{#if item.broadcast_time}
															<span class="slot-time slot-time--suspension"
																>{item.broadcast_time.slice(0, 5)}</span
															>
														{/if}
														<span class="slot-suspension-badge">休止</span>
													</div>
													<span class="slot-title slot-title--suspension">{item.title}</span>
													<span class="slot-bottom slot-reason">{item.message}</span>
												</div>
											</div>
										</div>
									{:else}
										{@const anime = item.anime}
										{@const broadcastTime = effectiveBroadcastTime(anime, displayDate)}
										{@const isSubscribed = subscribedIds.has(anime.id)}
										{@const isNotifying = notifyingIds.has(anime.id)}
										{@const isLive = liveRoomKeys.has(roomLiveKey(anime.id, displayDate))}
										{@const isMuted = mutedAnimeIds.has(anime.id)}
										{@const roomMute = roomMuteSettings[anime.id]}
										{@const subscribable = canSubscribe(anime)}
										{@const ep = currentEpisodeForSlot(anime, displayDate, data.broadcastOverrides[anime.id])}
										{@const isMarathon = ep !== null && isMarathonEpisodeSlot(ep)}
										{@const epBadge = ep !== null ? formatEpisodeBadge(ep, anime.episode_count) : null}
										{@const specialEpisodeLabel = ep !== null && ep.start == null && ep.end == null ? ep.label : null}
										{@const episodeLabel =
											epBadge !== null && specialEpisodeLabel === null ? (anime.episode_count ? epBadge : `#${epBadge}`) : null}
										{@const stationLabel = anime.broadcast_station?.length ? anime.broadcast_station.join(" / ") : null}
										<div
											class="anime-slot-wrap"
											class:anime-slot-wrap--notifying={isNotifying}
											class:anime-slot-wrap--menu-open={openAlertMenu === alertKey(anime.id, displayDate)}
										>
											<a href="/rooms/anime/{anime.id}/{displayDate}" class="anime-slot">
												<div class="slot-cover-wrap">
													{#if anime.cover_url}
														<img src={anime.cover_url} alt={anime.title} class="slot-cover">
													{:else}
														<div class="slot-cover slot-cover--placeholder"></div>
													{/if}
												</div>
												<div class="slot-info">
													<div class="slot-meta-row">
														{#if broadcastTime}
															<span class="slot-time">{broadcastTime.slice(0, 5)}</span>
														{/if}
														{#if isLive}
															<span class="slot-live-badge">LIVE</span>
														{/if}
													</div>
													<span class="slot-title">{anime.title}</span>
													{#if isMarathon && ep}
														<span class="slot-marathon-badge"
															>{formatMarathonBadge(ep)}</span
														>
													{/if}
													{#if specialEpisodeLabel}
														<span class="slot-special-label-badge"
															>{specialEpisodeLabel}</span
														>
													{/if}
													{#if episodeLabel || stationLabel}
														<span class="slot-bottom"
															>{[episodeLabel, stationLabel].filter(Boolean).join(" · ")}</span
														>
													{/if}
												</div>
											</a>
											{#if data.user}
												<div class="room-alert-control">
													<button
														type="button"
														class="notify-btn"
														class:notify-btn--active={isSubscribed}
														class:notify-btn--muted={isMuted}
														title={isMuted ? "ミュート中。通知またはミュートを設定" : "通知またはミュートを設定"}
														aria-label={isMuted ? "ミュート中。通知またはミュートを設定" : "通知またはミュートを設定"}
														aria-expanded={openAlertMenu === alertKey(anime.id, displayDate)}
														onclick={() => {
														const key = alertKey(anime.id, displayDate);
														openAlertMenu = openAlertMenu === key ? null : key;
													}}
													>
														{#if isMuted}
															<svg
																width="13"
																height="13"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"
																aria-hidden="true"
															>
																<path d="M10.268 21a2 2 0 0 0 3.464 0" />
																<path d="M17 17H4s3-2 3-9a5 5 0 0 1 .6-2.4" />
																<path d="M9.3 3.3A6 6 0 0 1 18 8c0 2.2.3 3.9.8 5.2" />
																<path d="m2 2 20 20" />
															</svg>
														{:else if isSubscribed}
															<svg
																width="13"
																height="13"
																viewBox="0 0 24 24"
																fill="currentColor"
																stroke="currentColor"
																stroke-width="1"
																aria-hidden="true"
															>
																<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
																<path d="M13.73 21a2 2 0 0 1-3.46 0" />
															</svg>
														{:else}
															<svg
																width="13"
																height="13"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
																stroke-linecap="round"
																stroke-linejoin="round"
																aria-hidden="true"
															>
																<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
																<path d="M13.73 21a2 2 0 0 1-3.46 0" />
															</svg>
														{/if}
													</button>
												</div>
												{#if openAlertMenu === alertKey(anime.id, displayDate)}
													<button
														type="button"
														class="alert-menu-backdrop"
														tabindex="-1"
														aria-label="閉じる"
														onclick={() => (openAlertMenu = null)}
													></button>
													<div class="room-alert-menu" aria-label="ルーム設定">
														{#if subscribable}
															<form
																method="POST"
																action="?/toggleBroadcastNotification"
																use:enhance={notifySubmit}
															>
																<input type="hidden" name="anime_id" value={anime.id}>
																<button
																	type="submit"
																	class="notify-toggle"
																	class:notify-toggle--on={isSubscribed}
																>
																	{#if isSubscribed}
																		<svg
																			width="13"
																			height="13"
																			viewBox="0 0 24 24"
																			fill="currentColor"
																			stroke="currentColor"
																			stroke-width="1"
																			aria-hidden="true"
																		>
																			<path
																				d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
																			/>
																			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
																		</svg>
																	{:else}
																		<svg
																			width="13"
																			height="13"
																			viewBox="0 0 24 24"
																			fill="none"
																			stroke="currentColor"
																			stroke-width="2"
																			stroke-linecap="round"
																			stroke-linejoin="round"
																			aria-hidden="true"
																		>
																			<path
																				d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
																			/>
																			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
																		</svg>
																	{/if}
																	<span class="notify-toggle-label"
																		>{isSubscribed ? "通知オン" : "通知オフ"}</span
																	>
																	<span class="notify-toggle-switch">
																		<span
																			class="notify-toggle-knob"
																			class:notify-toggle-knob--on={isSubscribed}
																		></span>
																	</span>
																</button>
															</form>
															<div class="menu-divider"></div>
														{/if}
														<p class="menu-section-label">ミュート設定</p>
														<div class="mute-chips">
															<form
																method="POST"
																action="?/removeBroadcastRoomMute"
																use:enhance={removeSubmit}
															>
																<input type="hidden" name="anime_id" value={anime.id}>
																<button
																	type="submit"
																	class="mute-chip"
																	class:mute-chip--active={!isMuted}
																>
																	ミュートしない
																</button>
															</form>
															<form
																method="POST"
																action="?/muteBroadcastRoom"
																use:enhance={muteSubmit}
															>
																<input type="hidden" name="anime_id" value={anime.id}>
																<input
																	type="hidden"
																	name="room_date"
																	value={displayDate}
																>
																<input type="hidden" name="duration" value="3">
																<input type="hidden" name="repeat_weekly" value="true">
																<button
																	type="submit"
																	class="mute-chip"
																	class:mute-chip--active={isMuted && roomMute?.mute_type === "period" && roomMute?.period_days === 3 && roomMute?.is_repeat}
																>
																	放送後3日間
																</button>
															</form>
															<form
																method="POST"
																action="?/muteBroadcastRoom"
																use:enhance={muteSubmit}
															>
																<input type="hidden" name="anime_id" value={anime.id}>
																<input
																	type="hidden"
																	name="room_date"
																	value={displayDate}
																>
																<input type="hidden" name="duration" value="event_end">
																<input type="hidden" name="repeat_weekly" value="true">
																<button
																	type="submit"
																	class="mute-chip"
																	class:mute-chip--active={isMuted && roomMute?.mute_type === "always"}
																>
																	常にミュート
																</button>
															</form>
														</div>
														<div class="menu-settings-link">
															<a
																href="/settings/mutes?anime_id={anime.id}"
																class="menu-settings-link-anchor"
															>
																<span
																	class="i-lucide-settings-2"
																	aria-hidden="true"
																></span>
																カスタムミュート設定
															</a>
														</div>
													</div>
												{/if}
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

{#if showEventDialog && data.isAdmin}
	<div class="dialog-backdrop">
		<button
			type="button"
			class="dialog-backdrop-hit"
			aria-label="閉じる"
			onclick={() => (showEventDialog = false)}
		></button>
		<div class="event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
			<header class="dialog-header">
				<h2 id="event-dialog-title">イベント作成</h2>
				<button
					type="button"
					class="dialog-close"
					aria-label="閉じる"
					onclick={() => (showEventDialog = false)}
				>
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</header>

			{#if form && "message" in form}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}

			<form method="POST" action="?/createEvent" use:enhance class="event-form">
				<label>
					<span>タイトル</span>
					<input class="input" type="text" name="title" required maxlength="100" placeholder="第3話 同時視聴">
				</label>
				<label>
					<span>開始日時</span>
					<div class="event-date-time-row">
						<input class="input" type="date" name="scheduled_date" required value={data.defaultEventDate}>
						<input
							class="input"
							type="text"
							name="scheduled_time"
							required
							inputmode="numeric"
							pattern="([01]?[0-9]|2[0-7]):[0-5][0-9]|28:00"
							placeholder="26:00"
							value={data.defaultEventTime}
						>
					</div>
					<span class="event-field-hint">深夜枠は 24:00〜28:00 の形式で入力できます</span>
				</label>
				<label>
					<span>ルームリンク</span>
					<input class="input" type="text" name="hashtag" required maxlength="50" placeholder="Anipolis視聴">
					<span class="event-field-hint">トレンド集計に使われるタグ名です</span>
				</label>
				<div class="event-anime-field">
					<span id="event-anime-field-label" class="event-form-label">対象アニメ</span>
					{#if selectedEventAnime}
						<input type="hidden" name="anime_id" value={selectedEventAnime.id}>
						<div class="event-anime-selected">
							{#if selectedEventAnime.cover_url}
								<img src={selectedEventAnime.cover_url} alt={selectedEventAnime.title}>
							{:else}
								<div class="event-anime-thumb-empty"></div>
							{/if}
							<div>
								<strong>{selectedEventAnime.title}</strong>
								{#if selectedEventAnime.title_en}
									<span>{selectedEventAnime.title_en}</span>
								{/if}
							</div>
							<button
								type="button"
								class="event-anime-clear"
								onclick={clearEventAnime}
								aria-label="対象アニメを解除"
							>
								<span class="i-lucide-x" aria-hidden="true"></span>
							</button>
						</div>
					{:else}
						<input
							class="input"
							type="search"
							aria-labelledby="event-anime-field-label"
							placeholder="アニメタイトルで検索"
							bind:value={eventAnimeQuery}
							oninput={handleEventAnimeQueryInput}
							onkeydown={(event) => {
								if (event.key === "Enter") event.preventDefault();
							}}
						>
						{#if eventAnimeSearching || eventAnimeResults.length > 0}
							<div class="event-anime-results" aria-live="polite" aria-busy={eventAnimeSearching}>
								{#if eventAnimeSearching}
									<p>検索中...</p>
								{:else}
									{#each eventAnimeResults as anime}
										<button
											type="button"
											class="event-anime-result"
											onclick={() => selectEventAnime(anime)}
										>
											{#if anime.cover_url}
												<img src={anime.cover_url} alt={anime.title}>
											{:else}
												<div class="event-anime-thumb-empty"></div>
											{/if}
											<span>
												<strong>{anime.title}</strong>
												{#if anime.title_en}
													<small>{anime.title_en}</small>
												{/if}
											</span>
										</button>
									{/each}
								{/if}
							</div>
						{/if}
					{/if}
				</div>
				<label>
					<span>説明</span>
					<textarea class="input" name="description" rows="3" placeholder="放映時間や対象話数など"></textarea>
				</label>
				<label>
					<span>所要時間（分）</span>
					<input class="input" type="number" name="duration_minutes" min="1" placeholder="30">
				</label>
				<button type="submit" class="btn btn-primary">作成してルームへ</button>
			</form>
		</div>
	</div>
{/if}

<style>
.schedule-page {
	--schedule-event-accent: #f97316;
	max-width: 1480px;
	margin: 0 auto;
	padding: 0 1rem 2rem;
}
:global([data-theme="light"]) .schedule-page {
	--schedule-event-accent: #c2410c;
}
.schedule-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.25rem 0 1rem;
}
.schedule-header h1 {
	font-size: 1.2rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0 0 4px;
}
.schedule-actions {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
	justify-content: flex-end;
}
.schedule-flash {
	margin: 0 0 10px;
}
.week-nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	min-width: 144px;
}
.mobile-schedule-title {
	display: none;
}
.week-nav-btn {
	min-width: 58px;
	height: 34px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.15rem;
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--color-text);
	background: var(--color-surface);
	text-decoration: none;
}
.week-nav-btn--disabled {
	opacity: 0.3;
	cursor: default;
}
.create-event-btn {
	border-radius: 8px;
	white-space: nowrap;
}
.schedule-grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(132px, 1fr));
	gap: 8px;
	overflow-x: auto;
}
.day-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 4px;
	font-size: 0.82rem;
	font-weight: 700;
	padding: 6px 8px;
	border-radius: 6px 6px 0 0;
	border: 1px solid var(--color-border);
	border-bottom: none;
}
.day-heading time {
	font-size: 0.7rem;
	color: color-mix(in srgb, currentColor 72%, transparent);
}
.day-slots {
	border: 1px solid var(--color-border);
	border-radius: 0 0 6px 6px;
	padding: 6px 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-height: 120px;
	background: color-mix(in srgb, var(--color-surface) 78%, transparent);
}
.empty-day {
	color: var(--color-text-muted);
	font-size: 0.8rem;
	text-align: center;
	padding: 8px 0;
	margin: 0;
}
.anime-time-group {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

/* Anime slot wrapper — holds the card + notify button */
.anime-slot-wrap {
	position: relative;
	border-radius: 6px;
}
.anime-slot-wrap--menu-open {
	z-index: 4;
}
.anime-slot-wrap--notifying {
	animation: notify-pulse 1.8s ease-in-out infinite;
	outline: 2px solid var(--accent, #6366f1);
	outline-offset: 1px;
}

/* Event slot wrapper — holds the card + bell button, mirrors .anime-slot-wrap */
.event-slot-wrap {
	position: relative;
	border-radius: 6px;
}
.event-slot-wrap--menu-open {
	z-index: 4;
}
@keyframes notify-pulse {
	0%,
	100% {
		outline-color: var(--accent, #6366f1);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, #6366f1) 40%, transparent);
	}
	50% {
		outline-color: var(--accent, #6366f1);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent, #6366f1) 0%, transparent);
	}
}

.anime-slot,
.event-slot {
	display: flex;
	align-items: flex-start;
	padding: 6px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	text-decoration: none;
	color: var(--color-text);
	transition: background 0.12s;
	width: 100%;
	box-sizing: border-box;
	overflow: hidden;
}
.anime-slot {
	height: 86px;
	padding: 4px 4px 4px 0;
	gap: 0;
	align-items: stretch;
}
.event-slot {
	height: 86px;
	padding: 4px 4px 4px 0;
	gap: 0;
	align-items: stretch;
}
.anime-slot-wrap .anime-slot {
	border: none;
}
.anime-slot:hover,
.event-slot:hover {
	background: var(--color-surface-hover);
}
.event-slot {
	border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
}

.event-slot--cancelled {
	opacity: 0.55;
	text-decoration: line-through;
}
.slot-cover-wrap {
	position: relative;
	width: 56px;
	align-self: stretch;
	flex-shrink: 0;
	border-radius: 4px;
	overflow: hidden;
}
.slot-cover {
	width: 100%;
	height: auto;
	display: block;
}
.slot-cover--placeholder {
	background: var(--color-border);
}
.slot-cover--event-placeholder {
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--schedule-event-accent) 16%, var(--color-surface));
	color: var(--schedule-event-accent);
	font-size: 1rem;
}
.anime-slot-wrap--suspension {
	opacity: 0.5;
}
.anime-slot-wrap .anime-slot--suspension {
	border: 1px dashed color-mix(in srgb, #71717a 55%, var(--border));
}
.slot-cover--suspension {
	height: 100%;
	background: color-mix(in srgb, #27272a 40%, transparent);
	border: 1px solid color-mix(in srgb, #3f3f46 30%, transparent);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	color: #71717a;
	font-size: 0.72rem;
	font-weight: 700;
	line-height: 1;
}
.slot-info {
	flex: 1;
	min-width: 0;
	padding-left: 10px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}
.slot-info--suspension {
	justify-content: space-between;
	height: 100%;
}
.slot-meta-row {
	display: flex;
	align-items: center;
	gap: 4px;
	padding-right: 28px;
}
.slot-meta-row--suspension {
	padding-right: 0;
}
.slot-time--suspension {
	color: color-mix(in srgb, #14b8a6 70%, transparent);
}
.slot-suspension-badge {
	margin-left: auto;
	flex-shrink: 0;
	font-size: 0.625rem;
	font-weight: 700;
	line-height: 1.4;
	color: #a1a1aa;
	background: #27272a;
	border-radius: 4px;
	padding: 2px 6px;
}
.slot-title--suspension {
	color: #a1a1aa;
	font-weight: 500;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	overflow: hidden;
}
.slot-reason {
	font-size: 0.625rem;
	color: #71717a;
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}
.slot-live-badge {
	margin-left: auto;
	flex-shrink: 0;
	font-size: 0.58rem;
	font-weight: 800;
	color: #fff;
	background: #e53e3e;
	border-radius: 3px;
	padding: 1px 4px;
	letter-spacing: 0.04em;
	line-height: 1.4;
	animation: live-pulse 1.8s ease-in-out infinite;
}
.slot-bottom {
	margin-top: auto;
	padding-top: 2px;
	font-size: 0.625rem;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.slot-kind {
	font-size: 0.62rem;
	font-weight: 800;
	color: var(--color-text-muted);
	letter-spacing: 0;
}
.slot-kind--event {
	color: var(--schedule-event-accent);
}
@keyframes live-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.65;
	}
}
.slot-time {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--color-accent);
}
.slot-time--event {
	color: var(--schedule-event-accent);
}
.slot-title {
	font-size: 0.73rem;
	font-weight: 700;
	color: var(--text);
	line-height: 1.35;
	margin-top: auto;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	text-overflow: ellipsis;
	word-break: break-word;
}
.slot-marathon-badge,
.slot-special-label-badge {
	display: inline-block;
	font-size: 0.62rem;
	font-weight: 700;
	color: var(--accent);
	line-height: 1.15;
	margin-top: 3px;
	padding: 0;
	width: fit-content;
}
/* Notification and spoiler mute menu */
.room-alert-control {
	position: absolute;
	top: 4px;
	right: 4px;
	z-index: 2;
}
.notify-btn {
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	cursor: pointer;
	transition:
		background 0.1s,
		color 0.1s,
		border-color 0.1s;
	padding: 0;
}
.notify-btn:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.notify-btn--active {
	background: color-mix(in srgb, var(--color-accent) 15%, var(--color-surface));
	border-color: var(--color-accent);
	color: var(--color-accent);
}
.notify-btn--muted {
	background: color-mix(in srgb, #ef4444 13%, var(--card-bg));
	border-color: color-mix(in srgb, #ef4444 72%, var(--border));
	color: #ef4444;
}
.notify-btn--muted:hover {
	background: color-mix(in srgb, #ef4444 18%, var(--card-bg));
	color: #dc2626;
}
/* Transparent full-screen catcher: taps outside the menu close it
   (and stop the underlying slot link from opening a room). */
.alert-menu-backdrop {
	position: fixed;
	inset: 0;
	z-index: 4;
	width: 100%;
	height: 100%;
	padding: 0;
	border: none;
	background: transparent;
	cursor: default;
}
.room-alert-menu {
	position: absolute;
	top: 30px;
	right: 4px;
	z-index: 5;
	width: 240px;
	padding: 12px;
	border: 1px solid var(--border);
	border-radius: 12px;
	background: var(--card-bg);
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

@media (min-width: 961px) {
	.day-col:first-child .room-alert-menu {
		left: 4px;
		right: auto;
	}
}

.notify-toggle {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--hover-bg);
	color: var(--text-muted);
	font-size: 0.78rem;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}
.notify-toggle--on {
	background: color-mix(in srgb, var(--accent) 12%, var(--card-bg));
	border-color: var(--accent);
	color: var(--accent);
}
.notify-toggle-label {
	flex: 1;
	text-align: left;
	font-weight: 500;
}
.notify-toggle-switch {
	width: 28px;
	height: 15px;
	border-radius: 999px;
	background: var(--border);
	position: relative;
	flex-shrink: 0;
	transition: background 0.15s;
}
.notify-toggle--on .notify-toggle-switch {
	background: var(--accent);
}
.notify-toggle-knob {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 11px;
	height: 11px;
	border-radius: 50%;
	background: white;
	transition: transform 0.15s;
}
.notify-toggle-knob--on {
	transform: translateX(13px);
}
.menu-divider {
	height: 1px;
	background: var(--border);
	margin: 0;
}
.menu-section-label {
	margin: 0;
	color: var(--text-muted);
	font-size: 0.68rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}
.mute-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.mute-chips form {
	display: contents;
}
.mute-chip {
	padding: 4px 10px;
	border: 1px solid var(--border);
	border-radius: 999px;
	background: transparent;
	color: var(--text-muted);
	font-size: 0.73rem;
	cursor: pointer;
	white-space: nowrap;
	transition:
		background 0.1s,
		border-color 0.1s,
		color 0.1s;
}
.mute-chip:hover {
	border-color: var(--accent);
	color: var(--accent);
}
.mute-chip--active {
	background: color-mix(in srgb, var(--accent) 15%, var(--card-bg));
	border-color: var(--accent);
	color: var(--accent);
	font-weight: 500;
}

.menu-settings-link {
	border-top: 1px solid var(--border);
	margin-top: 4px;
	padding-top: 8px;
}
.menu-settings-link-anchor {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	font-size: 0.68rem;
	color: var(--text-muted);
	text-decoration: none;
	transition: color 0.12s;
}
.menu-settings-link-anchor:hover {
	color: var(--accent);
}
.dialog-backdrop {
	position: fixed;
	inset: 0;
	z-index: 900;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	background: rgba(0, 0, 0, 0.58);
}
.dialog-backdrop-hit {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	cursor: default;
}
.event-dialog {
	position: relative;
	z-index: 1;
	width: min(520px, 100%);
	max-height: min(720px, calc(100vh - 2rem));
	overflow-y: auto;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	padding: 16px;
	box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}
.dialog-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 12px;
}
.dialog-header h2 {
	font-size: 1rem;
	margin: 0;
}
.dialog-close {
	width: 34px;
	height: 34px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 6px;
	color: var(--color-text-muted);
}
.dialog-close:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.event-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.event-form label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--color-text-muted);
}
.event-anime-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.event-form-label {
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--color-text-muted);
}
.event-field-hint {
	font-size: 0.72rem;
	font-weight: 400;
	color: var(--color-text-muted);
	opacity: 0.8;
}
.event-date-time-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 120px;
	gap: 8px;
}
.event-anime-selected,
.event-anime-result {
	display: grid;
	grid-template-columns: 40px minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	width: 100%;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background: var(--color-surface);
	color: var(--color-text);
}
.event-anime-selected {
	padding: 6px;
}
.event-anime-selected img,
.event-anime-result img,
.event-anime-thumb-empty {
	width: 40px;
	height: 54px;
	border-radius: 4px;
	object-fit: cover;
	background: var(--color-border);
}
.event-anime-selected div,
.event-anime-result span {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.event-anime-selected strong,
.event-anime-result strong {
	font-size: 0.78rem;
	line-height: 1.3;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.event-anime-selected span,
.event-anime-result small {
	font-size: 0.68rem;
	font-weight: 500;
	color: var(--color-text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.event-anime-clear {
	width: 28px;
	height: 28px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 5px;
	color: var(--color-text-muted);
}
.event-anime-clear:hover,
.event-anime-result:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.event-anime-results {
	max-height: 220px;
	overflow: auto;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.event-anime-results p {
	margin: 0;
	font-size: 0.75rem;
	color: var(--color-text-muted);
}
.event-anime-result {
	grid-template-columns: 40px minmax(0, 1fr);
	padding: 6px;
	text-align: left;
	cursor: pointer;
}
.event-form textarea {
	resize: vertical;
}
.form-error {
	color: var(--color-danger);
	font-size: 0.8rem;
	margin: 0 0 8px;
}
.day-tab-bar {
	display: none;
}

@media (max-width: 960px) {
	.schedule-page {
		padding-bottom: 80px;
	}
	.schedule-header {
		padding: 8px 0 6px;
	}
	.schedule-header > div:first-child {
		display: none;
	}
	.schedule-actions {
		width: 100%;
		justify-content: center;
	}
	.week-nav {
		display: grid;
		grid-template-columns: 58px minmax(0, 1fr) 58px;
		gap: 8px;
		width: 100%;
	}
	.mobile-schedule-title {
		display: block;
		align-self: center;
		margin: 0;
		font-size: 1rem;
		line-height: 1.2;
		text-align: center;
		white-space: nowrap;
	}
	.create-event-btn {
		position: fixed;
		top: 6px;
		right: 92px;
		z-index: 161;
		width: 40px;
		height: 40px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm, 6px);
		background: transparent;
		color: var(--text);
		box-shadow: none;
		justify-content: center;
	}
	.create-event-label {
		display: none;
	}
	.schedule-grid {
		grid-template-columns: 1fr;
	}
	.day-col {
		display: none;
	}
	.day-col--selected {
		display: block;
	}
	.day-tab-bar {
		display: flex;
		overflow-x: auto;
		scrollbar-width: none;
		gap: 0;
		border-bottom: 1px solid var(--border);
		margin: 0 0 12px;
		-webkit-overflow-scrolling: touch;
	}
	.day-tab-bar::-webkit-scrollbar {
		display: none;
	}
	.day-tab {
		flex: 0 0 calc(100% / 4.5);
		padding: 10px 4px 8px;
		text-align: center;
		background: none;
		border: none;
		border-bottom: 3px solid transparent;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		color: var(--text-muted);
		transition: border-color 0.15s;
	}
	.day-tab--active {
		border-bottom-color: var(--accent, #6366f1);
		color: var(--text);
	}
	.day-tab-label {
		font-size: 0.78rem;
		font-weight: 700;
	}
	.day-tab-date {
		font-size: 0.72rem;
	}
	.anime-time-group {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px;
		width: 100%;
		max-width: 388px;
	}
	.anime-time-group > .anime-slot-wrap:nth-child(odd) .room-alert-menu,
	.anime-time-group > .event-slot-wrap:nth-child(odd) .room-alert-menu {
		left: 4px;
		right: auto;
		width: min(240px, calc(100vw - 32px));
	}
	.anime-slot {
		height: 98px;
		padding: 4px 4px 4px 0;
	}
	.event-slot {
		height: 98px;
	}
	.slot-cover-wrap {
		width: 68px;
	}
}
</style>
