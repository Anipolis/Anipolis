<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { Anime } from "$lib/types";
import type { ActionData, PageProps } from "./$types";

let { data, form }: PageProps & { form: ActionData } = $props();

let showEventDialog = $state(false);
let openAlertMenu = $state<string | null>(null);

// Notification subscription state — optimistic, keyed by anime.id
let subscribedIds = $state(new Set<string>(untrack(() => data.subscriptions)));
let mutedAnimeIds = $state(new Set<string>(untrack(() => data.mutedAnimeIds)));
const muteDays = [1, 2, 3, 4, 5, 6, 7] as const;

// Which anime are currently in their notification window (client-side highlight)
let notifyingIds = $state(new Set<string>());

// Which anime rooms are currently live (broadcast started, within 90 min)
let liveAnimeIds = $state(new Set<string>());

function getDefaultDayIndex(): number {
	return new Date().getDay(); // 0=日〜6=土
}
function getDisplayDayOrder(): number[] {
	const today = new Date().getDay();
	return Array.from({ length: 7 }, (_, i) => (today - 3 + i + 7) % 7);
}

function parseDateInput(value: string): Date {
	return new Date(`${value}T00:00:00`);
}

function toDateInputValue(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function getDisplayDateForDay(dayIdx: number, fallbackDate: string): string {
	const centerDayIdx = getDefaultDayIndex();
	const displayPos = getDisplayDayOrder().indexOf(dayIdx);
	if (displayPos === -1) return fallbackDate;

	const centerDate = addDays(parseDateInput(data.weekStart), centerDayIdx);
	return toDateInputValue(addDays(centerDate, displayPos - 3));
}

function getDisplayDayItems() {
	return getDisplayDayOrder()
		.map((dayIdx) => {
			const day = data.days[dayIdx];
			if (!day) return null;
			return {
				dayIdx,
				day,
				date: getDisplayDateForDay(dayIdx, day.date),
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
});

$effect(() => {
	data.weekStart;
	selectedDayIndex = getDefaultDayIndex();
});

function formatDate(value: string) {
	return new Date(`${value}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatShortDate(value: string): string {
	const d = new Date(`${value}T00:00:00`);
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// Returns minutes until broadcast from now, or null if not applicable today.
// Handles late-night times ≥ 24:00 (e.g. "25:30" = 1:30am next calendar day).
function minutesUntilBroadcast(anime: Anime, now: Date): number | null {
	if (!anime.broadcast_time || anime.broadcast_day == null) return null;
	const match = anime.broadcast_time.match(/^(\d{1,2}):(\d{2})/);
	if (!match) return null;

	const broadcastHour = Number(match[1]);
	const broadcastMin = Number(match[2]);
	const todayDay = now.getDay();
	const currentMin = now.getHours() * 60 + now.getMinutes();

	if (broadcastHour < 24) {
		if (todayDay !== anime.broadcast_day) return null;
		return broadcastHour * 60 + broadcastMin - currentMin;
	}
	// Late night: broadcast_day is the "schedule day", actual calendar day is +1
	const actualDay = (anime.broadcast_day + 1) % 7;
	if (todayDay !== actualDay) return null;
	return (broadcastHour - 24) * 60 + broadcastMin - currentMin;
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
			const mins = minutesUntilBroadcast(anime, now);
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
			const mins = minutesUntilBroadcast(anime, now);
			if (mins !== null && mins <= 0 && mins >= -90) {
				next.add(anime.id);
			}
		}
	}
	liveAnimeIds = next;
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

const muteSubmit: SubmitFunction = () => {
	openAlertMenu = null;
	return async ({ update }) => {
		await update({ reset: false });
	};
};

function alertKey(animeId: string, date: string) {
	return `${animeId}:${date}`;
}

// Check if anime status allows notifications (airing or upcoming only)
function canSubscribe(anime: Anime): boolean {
	const s = anime.computed_broadcast_status ?? anime.status;
	return s === "airing" || s === "upcoming";
}

function currentEpisodeForSlot(anime: Anime, dateStr: string): number | null {
	if (!anime.aired_from) return null;
	const airedFrom = new Date(`${anime.aired_from.slice(0, 10)}T00:00:00`);
	const slotDate = new Date(`${dateStr}T00:00:00`);
	// Late-night broadcasts (≥ 24:00) actually air on the next calendar day
	const broadcastHour = anime.broadcast_time ? Number(anime.broadcast_time.split(":")[0]) : 0;
	if (broadcastHour >= 24) slotDate.setDate(slotDate.getDate() + 1);
	const msDiff = slotDate.getTime() - airedFrom.getTime();
	if (msDiff < 0) return null;
	const weeksElapsed = Math.floor(Math.round(msDiff / 86_400_000) / 7);
	const ep = weeksElapsed + 1;
	if (anime.episode_count) {
		const maxEp = parseInt(anime.episode_count, 10);
		if (!Number.isNaN(maxEp) && ep > maxEp) return maxEp;
	}
	return ep;
}
</script>

<svelte:head> <title>放送スケジュール - Anipolis</title> </svelte:head>

<div class="schedule-page">
	<header class="schedule-header">
		<div>
			<h1>放送スケジュール</h1>
			<p class="schedule-subtitle">放送中のアニメと同時視聴イベントをまとめて確認できます。</p>
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
				<button type="button" class="btn btn-primary create-event-btn" onclick={() => (showEventDialog = true)}>
					<span class="i-lucide-calendar-plus" aria-hidden="true"></span>
					イベント作成
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
			{@const displayDate = d === selectedDayIndex ? getDisplayDateForDay(d, day.date) : day.date}
			<div class="day-col" class:day-col--selected={d === selectedDayIndex}>
				<div class="day-heading" style="color: {DAY_COLOR[d]}; background: {DAY_BG[d]}">
					<span>{day.label}曜日</span>
					<time>{formatDate(displayDate)}</time>
				</div>
				<div class="day-slots">
					{#if day.events.length === 0 && day.anime.length === 0}
						<p class="empty-day">なし</p>
					{:else}
						{#each day.events as event (event.id)}
							<a
								href="/events/{event.id}"
								class="event-slot"
								class:event-slot--cancelled={event.is_cancelled}
							>
								<span class="slot-kind">EVENT</span>
								<span class="slot-time">{formatTime(event.scheduled_at)}</span>
								<span class="slot-title">{event.title}</span>
								<span class="slot-station">#{event.hashtag}</span>
							</a>
						{/each}

						{#each day.anime as anime (anime.id)}
							{@const isSubscribed = subscribedIds.has(anime.id)}
							{@const isNotifying = notifyingIds.has(anime.id)}
							{@const isLive = liveAnimeIds.has(anime.id)}
							{@const isMuted = mutedAnimeIds.has(anime.id)}
							{@const roomMute = data.roomMuteSettings[anime.id]}
							{@const subscribable = canSubscribe(anime)}
							{@const ep = currentEpisodeForSlot(anime, displayDate)}
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
										{#if ep !== null}
											<span class="slot-ep-badge"
												>{ep}{anime.episode_count ? `/${anime.episode_count}` : ""}</span
											>
										{/if}
									</div>
									<div class="slot-info">
										<span class="slot-kind">ROOM</span>
										{#if isLive}
											<span class="slot-live-badge">LIVE</span>
										{/if}
										{#if anime.broadcast_time}
											<span class="slot-time">{anime.broadcast_time.slice(0, 5)}</span>
										{/if}
										<span class="slot-title">{anime.title}</span>
										{#if anime.broadcast_station?.length}
											<span class="slot-station">{anime.broadcast_station.join(" / ")}</span>
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
											title="通知またはミュートを設定"
											aria-label="通知またはミュートを設定"
											aria-expanded={openAlertMenu === alertKey(anime.id, displayDate)}
											onclick={() => {
												const key = alertKey(anime.id, displayDate);
												openAlertMenu = openAlertMenu === key ? null : key;
											}}
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
										{#if openAlertMenu === alertKey(anime.id, displayDate)}
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
															class="alert-choice"
															class:alert-choice--active={isSubscribed}
														>
															<span class="i-lucide-bell" aria-hidden="true"></span>
															{isSubscribed ? "通知を解除" : "通知を設定"}
														</button>
													</form>
												{/if}
												<form
													method="POST"
													action="?/muteBroadcastRoom"
													use:enhance={muteSubmit}
												>
													<input type="hidden" name="anime_id" value={anime.id}>
													<input type="hidden" name="room_date" value={displayDate}>
													<label class="alert-mute-field">
														<span>ミュート期間</span>
														<select name="duration">
															{#each muteDays as days}
																<option
																	value={days}
																	selected={(roomMute?.duration ?? 3) === days}
																>
																	{days}日
																</option>
															{/each}
															<option
																value="event_end"
																selected={roomMute?.duration === "event_end"}
															>
																イベント終了まで
															</option>
														</select>
													</label>
													<label class="alert-mute-repeat">
														<input
															type="checkbox"
															name="repeat_weekly"
															value="true"
															checked={roomMute?.repeat_weekly}
														>
														毎週繰り返す
													</label>
													<button
														type="submit"
														class="alert-choice"
														class:alert-choice--active={isMuted}
													>
														<span class="i-lucide-bell-off" aria-hidden="true"></span>
														{roomMute ? "ミュート設定を更新" : "ミュートを設定"}
													</button>
												</form>
												<a class="alert-settings-link" href="/settings/rooms/mutes"
													>期間を設定</a
												>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<section class="event-strip" aria-label="今週のイベント">
		<div class="event-strip-header">
			<h2>今週のイベント</h2>
			<span>{data.events.length}件</span>
		</div>
		{#if data.events.length > 0}
			<div class="event-list">
				{#each data.events as event}
					<a
						href="/events/{event.id}"
						class="event-list-item"
						class:event-list-item--cancelled={event.is_cancelled}
					>
						<time>
							{new Date(event.scheduled_at).toLocaleDateString("ja-JP", {
								weekday: "short",
								month: "numeric",
								day: "numeric",
							})}
							{formatTime(event.scheduled_at)}
						</time>
						<strong>{event.title}</strong>
						<span>#{event.hashtag}</span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="panel-muted">今週のイベントはまだありません。</p>
		{/if}
	</section>
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
				<p class="form-error">{form.message}</p>
			{/if}

			<form method="POST" action="?/createEvent" use:enhance class="event-form">
				<label>
					<span>タイトル</span>
					<input class="input" type="text" name="title" required maxlength="100" placeholder="第3話 同時視聴">
				</label>
				<label>
					<span>開始日時</span>
					<input
						class="input"
						type="datetime-local"
						name="scheduled_at"
						required
						value={data.defaultScheduledAt}
					>
				</label>
				<label>
					<span>ハッシュタグ</span>
					<input class="input" type="text" name="hashtag" required maxlength="50" placeholder="Anipolis視聴">
				</label>
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
	max-width: 1480px;
	margin: 0 auto;
	padding: 0 1rem 2rem;
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
	color: var(--text);
	margin: 0 0 4px;
}
.schedule-subtitle {
	font-size: 0.82rem;
	color: var(--text-muted);
	margin: 0;
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
.week-nav-btn {
	min-width: 58px;
	height: 34px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.15rem;
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--text);
	background: var(--card-bg);
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
	border: 1px solid var(--border);
	border-bottom: none;
}
.day-heading time {
	font-size: 0.7rem;
	color: color-mix(in srgb, currentColor 72%, transparent);
}
.day-slots {
	border: 1px solid var(--border);
	border-radius: 0 0 6px 6px;
	padding: 6px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-height: 120px;
	background: color-mix(in srgb, var(--card-bg) 78%, transparent);
}
.empty-day {
	color: var(--text-muted);
	font-size: 0.8rem;
	text-align: center;
	padding: 8px 0;
	margin: 0;
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
	gap: 7px;
	height: 76px;
	padding: 6px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	text-decoration: none;
	color: var(--text);
	transition: background 0.12s;
	width: 100%;
	box-sizing: border-box;
	overflow: hidden;
}
.anime-slot-wrap .anime-slot {
	border: none;
}
.anime-slot:hover,
.event-slot:hover {
	background: var(--hover-bg);
}
.event-slot {
	flex-direction: column;
	gap: 2px;
	border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.event-slot--cancelled,
.event-list-item--cancelled {
	opacity: 0.55;
	text-decoration: line-through;
}
.slot-cover-wrap {
	position: relative;
	width: 36px;
	height: 52px;
	flex-shrink: 0;
	border-radius: 3px;
	overflow: hidden;
}
.slot-cover {
	width: 36px;
	height: 52px;
	object-fit: cover;
	border-radius: 3px;
}
.slot-cover--placeholder {
	background: var(--border);
}
.slot-ep-badge {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	text-align: center;
	font-size: 0.58rem;
	font-weight: 700;
	color: #fff;
	background: rgba(0, 0, 0, 0.62);
	padding: 1px 2px 2px;
	line-height: 1.4;
}
.slot-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	overflow: hidden;
}
.slot-kind {
	font-size: 0.62rem;
	font-weight: 800;
	color: var(--text-muted);
	letter-spacing: 0;
}
.slot-live-badge {
	display: inline-block;
	font-size: 0.58rem;
	font-weight: 800;
	color: #fff;
	background: #e53e3e;
	border-radius: 3px;
	padding: 1px 4px;
	letter-spacing: 0.04em;
	vertical-align: middle;
	line-height: 1.4;
	animation: live-pulse 1.8s ease-in-out infinite;
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
	color: var(--accent);
}
.slot-title {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--text);
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	text-overflow: ellipsis;
	word-break: break-word;
}
.slot-station {
	font-size: 0.7rem;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
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
	background: var(--card-bg);
	border: 1px solid var(--border);
	color: var(--text-muted);
	cursor: pointer;
	transition:
		background 0.1s,
		color 0.1s,
		border-color 0.1s;
	padding: 0;
}
.notify-btn:hover {
	background: var(--hover-bg);
	color: var(--text);
}
.notify-btn--active {
	background: color-mix(in srgb, var(--accent) 15%, var(--card-bg));
	border-color: var(--accent);
	color: var(--accent);
}
.notify-btn--muted {
	border-color: var(--accent);
}
.room-alert-menu {
	position: absolute;
	top: 26px;
	right: 0;
	z-index: 5;
	min-width: 190px;
	padding: 5px;
	border: 1px solid var(--border);
	border-radius: 7px;
	background: var(--card-bg);
	box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.alert-mute-field,
.alert-mute-repeat {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 5px 8px;
	color: var(--text-muted);
	font-size: 0.72rem;
	white-space: nowrap;
}
.alert-mute-field select {
	min-width: 86px;
	padding: 3px 4px;
	border: 1px solid var(--border);
	border-radius: 4px;
	background: var(--card-bg);
	color: var(--text);
	font: inherit;
}
.alert-mute-repeat {
	justify-content: flex-start;
}
.alert-choice {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 7px 8px;
	border: none;
	border-radius: 5px;
	background: transparent;
	color: var(--text);
	font-size: 0.76rem;
	white-space: nowrap;
	cursor: pointer;
}
.alert-choice:hover,
.alert-choice--active {
	background: color-mix(in srgb, var(--accent) 13%, var(--card-bg));
	color: var(--accent);
}
.alert-settings-link {
	padding: 6px 8px 4px;
	border-top: 1px solid var(--border);
	color: var(--text-muted);
	font-size: 0.7rem;
	text-decoration: none;
	white-space: nowrap;
}
.alert-settings-link:hover {
	color: var(--accent);
}

.event-strip {
	margin-top: 14px;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--card-bg);
	padding: 12px;
}
.event-strip-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}
.event-strip h2 {
	font-size: 0.95rem;
	margin: 0;
	color: var(--text);
}
.event-strip-header span {
	font-size: 0.75rem;
	color: var(--text-muted);
}
.event-list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 8px;
}
.event-list-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px;
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--text);
	text-decoration: none;
}
.event-list-item time,
.event-list-item span,
.panel-muted {
	font-size: 0.76rem;
	color: var(--text-muted);
}
.event-list-item strong {
	font-size: 0.84rem;
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
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--card-bg);
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
	color: var(--text-muted);
}
.dialog-close:hover {
	background: var(--hover-bg);
	color: var(--text);
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
	color: var(--text-muted);
}
.event-form textarea {
	resize: vertical;
}
.form-error {
	color: var(--danger, #ef4444);
	font-size: 0.8rem;
	margin: 0 0 8px;
}
.day-tab-bar {
	display: none;
}

@media (max-width: 760px) {
	.schedule-header {
		align-items: flex-start;
		flex-direction: column;
	}
	.schedule-actions {
		width: 100%;
		justify-content: space-between;
	}
	.schedule-grid {
		grid-template-columns: repeat(4, minmax(118px, 1fr));
	}
}
@media (max-width: 520px) {
	.schedule-actions {
		align-items: stretch;
		flex-direction: column;
	}
	.week-nav {
		justify-content: space-between;
	}
	.create-event-btn {
		justify-content: center;
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
}
</style>
