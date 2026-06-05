<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { enhance } from "$app/forms";
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();

type RoomStatus = "not_open" | "open" | "ended";

let now = $state(Date.now());
let intervalId: ReturnType<typeof setInterval>;
let postContent = $state("");
let textareaEl: HTMLTextAreaElement | null = $state(null);

const maxLen = 280;
const scheduledMs = $derived(new Date(data.room.scheduled_at).getTime());
const openMs = $derived(new Date(data.room.posting_opens_at).getTime());
const closeMs = $derived(new Date(data.room.posting_closes_at).getTime());
const openLeadMinutes = $derived(Math.round((scheduledMs - openMs) / (60 * 1000)));
const roomHref = $derived(`/rooms/anime/${data.anime.id}/${data.room.date}`);
const hashtagSuffix = $derived(` #${data.room.hashtag}`);
const contentWithTag = $derived(
	postContent.includes(`#${data.room.hashtag}`) ? postContent : postContent + hashtagSuffix,
);
const charCount = $derived(contentWithTag.length);
const overLimit = $derived(charCount > maxLen);

const status = $derived.by<RoomStatus>(() => {
	if (now < openMs) return "not_open";
	if (now >= closeMs) return "ended";
	return "open";
});

onMount(() => {
	intervalId = setInterval(() => {
		now = Date.now();
	}, 1000);
	if (!("ontouchstart" in window) && textareaEl) {
		textareaEl.focus();
	}
});

onDestroy(() => clearInterval(intervalId));

$effect(() => {
	if (form && "success" in form && form.success) postContent = "";
});

function formatHMS(ms: number) {
	const totalSec = Math.floor(Math.abs(ms) / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const timerLabel = $derived.by(() => {
	if (status === "not_open") return `開場まで ${formatHMS(openMs - now)}`;
	if (status === "open" && now < scheduledMs) return `放送開始まで ${formatHMS(scheduledMs - now)}`;
	if (status === "open") return `投稿終了まで ${formatHMS(closeMs - now)}`;
	return "このルームは終了しました";
});

function formatDate(iso: string) {
	return new Date(iso).toLocaleString("ja-JP", {
		year: "numeric",
		month: "short",
		day: "numeric",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}
</script>

<svelte:head> <title>{data.room.title} - Anipolis</title> </svelte:head>

<div class="page-container">
	<div class="feed-column">
		<div class="room-mobile-bar">
			<span class="room-mobile-title">{data.room.title}</span>
			<span class="room-mobile-timer event-timer--{status}">{timerLabel}</span>
			{#if status === "open"}
				<span class="event-timer-badge">受付中</span>
			{/if}
		</div>

		{#if data.user && status === "open"}
			<div class="card composer">
				{#if form && "message" in form}
					<p class="form-error">{form.message}</p>
				{/if}
				<form method="POST" action="?/createPost" use:enhance>
					<div class="composer-body">
						<textarea
							bind:this={textareaEl}
							class="composer-textarea"
							name="content"
							placeholder="#{data.room.hashtag} で実況しよう... (Shift+Enterで改行)"
							rows="3"
							bind:value={postContent}
							maxlength={maxLen}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
									e.preventDefault();
									if (!overLimit && postContent.trim()) {
										e.currentTarget.closest('form')?.requestSubmit();
									}
								}
							}}
						></textarea>
						<div class="composer-footer">
							<span class="char-count {overLimit ? 'char-count--over' : ''}">{charCount}/{maxLen}</span>
							<button
								type="submit"
								class="btn btn-primary btn-sm"
								disabled={overLimit || !postContent.trim()}
							>
								投稿
							</button>
						</div>
					</div>
					<p class="composer-hint">投稿には <strong>#{data.room.hashtag}</strong> が自動で付きます。</p>
				</form>
			</div>
		{:else if !data.user && status === "open"}
			<div class="card anime-room-login">
				<a href="/auth" class="btn btn-primary">ログインして参加</a>
			</div>
		{:else if status === "not_open"}
			<div class="card anime-room-login">投稿受付は放送開始{openLeadMinutes}分前から始まります。</div>
		{:else}
			<div class="card anime-room-login">
				このルームの投稿受付は終了しました。<a href="/?quote_anime={data.anime.id}">通常投稿で感想を残す</a>
			</div>
		{/if}

		<div class="event-posts-header">
			<span class="event-posts-count">{data.posts.length}件の実況</span>
		</div>

		{#if data.posts.length === 0}
			<div class="card anime-room-empty">
				まだ実況投稿はありません。<br>
				#{data.room.hashtag}
				で最初の感想を残しましょう。
			</div>
		{:else}
			{#each data.posts as post (post.id)}
				<PostCard
					{post}
					currentUserId={data.user?.id ?? null}
					insideRoom={true}
					roomContext={{ href: roomHref, title: `${data.anime.title} の放送ルーム` }}
				/>
			{/each}
		{/if}
	</div>

	<aside class="sidebar-column">
		<div class="card room-info-panel">
			<div class="room-info-top">
				<a href="/anime/{data.anime.id}" class="room-info-cover-link" aria-label="アニメ詳細を開く">
					{#if data.anime.cover_url}
						<img src={data.anime.cover_url} alt={data.anime.title} class="room-info-cover">
					{:else}
						<div class="room-info-cover room-info-cover--placeholder"></div>
					{/if}
				</a>
				<div class="room-info-text">
					<div class="event-room-hashtag">
						<a href="/hashtag/{data.room.hashtag}" class="hashtag-link">#{data.room.hashtag}</a>
					</div>
					<h1 class="room-info-title">{data.room.title}</h1>
					<div class="event-room-meta">
						<time>{formatDate(data.room.scheduled_at)}</time>
						<span> / {data.room.duration_minutes}分枠</span>
						<span>
							/ 投稿受付 {formatDate(data.room.posting_opens_at)} -
							{formatDate(data.room.posting_closes_at)}</span
						>
						{#if data.anime.broadcast_station?.length}
							<span> / {data.anime.broadcast_station.join(" / ")}</span>
						{/if}
					</div>
				</div>
			</div>
			<div class="event-timer event-timer--{status} room-timer-compact">
				<div class="event-timer-display">{timerLabel}</div>
				{#if status === "open"}
					<div class="event-timer-badge">受付中</div>
				{/if}
			</div>
		</div>

		<div class="anime-room-back">
			<a href="/schedule" class="btn btn-ghost">週間スケジュールへ戻る</a>
		</div>
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
/* ── モバイル用コンパクトバー (サイドバー非表示時のみ表示) ── */
.room-mobile-bar {
	display: none;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	margin-bottom: 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	overflow: hidden;
}
.room-mobile-title {
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
	min-width: 0;
}
.room-mobile-timer {
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-muted);
	white-space: nowrap;
	flex-shrink: 0;
}
.room-mobile-timer.event-timer--open {
	color: var(--color-primary);
	font-weight: 600;
}
@media (max-width: 960px) {
	.room-mobile-bar {
		display: flex;
	}
}

/* ── サイドバー内ルーム情報パネル ── */
.room-info-panel {
	margin-bottom: 16px;
}
.room-info-top {
	display: flex;
	gap: 10px;
	align-items: flex-start;
}
.room-info-cover-link {
	flex-shrink: 0;
}
.room-info-cover {
	width: 52px;
	height: 74px;
	object-fit: cover;
	border-radius: 5px;
	border: 1px solid var(--color-border);
	background: var(--color-border);
	display: block;
}
.room-info-cover--placeholder {
	background: var(--color-surface);
}
.room-info-text {
	min-width: 0;
}
.room-info-title {
	font-size: 14px;
	font-weight: 700;
	margin: 4px 0 4px;
	color: var(--color-text);
	line-height: 1.4;
}
.room-timer-compact {
	margin-top: 12px;
	padding: 10px 12px;
}
.room-timer-compact .event-timer-display {
	font-size: 17px;
}

/* ── ログイン/空状態 ── */
.anime-room-login,
.anime-room-empty {
	text-align: center;
	color: var(--color-muted);
	padding: 24px;
}

/* ── スケジュールへ戻るボタン ── */
.anime-room-back {
	margin-bottom: 16px;
}
.anime-room-back .btn {
	width: 100%;
}
</style>
