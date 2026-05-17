<script lang="ts">
import { enhance } from "$app/forms";
import type { ActionData, PageProps } from "./$types";

let { data, form }: PageProps & { form: ActionData } = $props();

let showEventDialog = $state(false);

const DAY_BG = ["#fff1f0", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#f4f7ff", "#eff8ff"];
const DAY_COLOR = ["#dc2626", "#334155", "#334155", "#334155", "#334155", "#334155", "#2563eb"];

$effect(() => {
	if (form && "message" in form) showEventDialog = true;
});

function formatDate(value: string) {
	return new Date(`${value}T00:00:00`).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
</script>

<svelte:head> <title>週間スケジュール - Anipolis</title> </svelte:head>

<div class="schedule-page">
	<header class="schedule-header">
		<div>
			<h1>週間スケジュール</h1>
			<p class="schedule-subtitle">放送予定と同時視聴イベントをまとめて確認できます（JST）</p>
		</div>
		<div class="schedule-actions">
			<div class="week-nav">
				<a class="week-nav-btn" href="/schedule?week={data.prevWeek}" aria-label="前の週">
					<span class="i-lucide-chevron-left" aria-hidden="true"></span>
				</a>
				<span class="week-range">{formatDate(data.weekStart)} の週</span>
				<a class="week-nav-btn" href="/schedule?week={data.nextWeek}" aria-label="次の週">
					<span class="i-lucide-chevron-right" aria-hidden="true"></span>
				</a>
			</div>
			{#if data.user}
				<button type="button" class="btn btn-primary create-event-btn" onclick={() => (showEventDialog = true)}>
					<span class="i-lucide-calendar-plus" aria-hidden="true"></span>
					イベント作成
				</button>
			{:else}
				<a href="/auth" class="btn btn-primary create-event-btn">
					<span class="i-lucide-log-in" aria-hidden="true"></span>
					ログインして作成
				</a>
			{/if}
		</div>
	</header>

	<div class="schedule-grid">
		{#each data.days as day, d}
			<div class="day-col">
				<div class="day-heading" style="color: {DAY_COLOR[d]}; background: {DAY_BG[d]}">
					<span>{day.label}曜日</span>
					<time>{formatDate(day.date)}</time>
				</div>
				<div class="day-slots">
					{#if day.events.length === 0 && day.anime.length === 0}
						<p class="empty-day">予定なし</p>
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
							<a href="/anime/{anime.id}" class="anime-slot">
								{#if anime.cover_url}
									<img src={anime.cover_url} alt={anime.title} class="slot-cover">
								{:else}
									<div class="slot-cover slot-cover--placeholder"></div>
								{/if}
								<div class="slot-info">
									<span class="slot-kind">ON AIR</span>
									{#if anime.broadcast_time}
										<span class="slot-time">{anime.broadcast_time.slice(0, 5)}</span>
									{/if}
									<span class="slot-title">{anime.title}</span>
									{#if anime.broadcast_station?.length}
										<span class="slot-station">{anime.broadcast_station.join(" / ")}</span>
									{/if}
								</div>
							</a>
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

{#if showEventDialog && data.user}
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
					<input class="input" type="text" name="hashtag" required maxlength="50" placeholder="Anipolis実況">
				</label>
				<label>
					<span>説明</span>
					<textarea class="input" name="description" rows="3" placeholder="集合時間や見る話数など"></textarea>
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
.week-nav {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.week-range {
	font-size: 0.85rem;
	font-weight: 700;
	color: var(--text);
	white-space: nowrap;
}
.week-nav-btn {
	width: 34px;
	height: 34px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: 1px solid var(--border);
	border-radius: 6px;
	color: var(--text);
	background: var(--card-bg);
	text-decoration: none;
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
.anime-slot,
.event-slot {
	display: flex;
	align-items: flex-start;
	gap: 7px;
	padding: 6px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	text-decoration: none;
	color: var(--text);
	transition: background 0.12s;
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
.slot-cover {
	width: 36px;
	height: 52px;
	object-fit: cover;
	border-radius: 3px;
	flex-shrink: 0;
}
.slot-cover--placeholder {
	background: var(--border);
}
.slot-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	overflow: hidden;
}
.slot-kind {
	font-size: 0.62rem;
	font-weight: 800;
	color: var(--text-muted);
	letter-spacing: 0;
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
	-webkit-line-clamp: 3;
	line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.slot-station {
	font-size: 0.7rem;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
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
		grid-template-columns: repeat(2, 1fr);
	}
}
</style>
