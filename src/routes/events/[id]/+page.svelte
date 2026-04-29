<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { enhance } from "$app/forms";
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();

// ── タイマーロジック ──────────────────────────────────────────

type EventStatus = "upcoming" | "live" | "ended" | "cancelled";

let now = $state(Date.now());
let intervalId: ReturnType<typeof setInterval>;

onMount(() => {
	intervalId = setInterval(() => {
		now = Date.now();
	}, 1000);
});
onDestroy(() => clearInterval(intervalId));

const scheduledMs = $derived(new Date(data.event.scheduled_at).getTime());
const endMs = $derived(data.event.duration_minutes ? scheduledMs + data.event.duration_minutes * 60 * 1000 : null);

const status = $derived.by<EventStatus>(() => {
	if (data.event.is_cancelled) return "cancelled";
	if (now < scheduledMs) return "upcoming";
	if (endMs !== null && now >= endMs) return "ended";
	return "live";
});

/** HH:MM:SS 形式にフォーマット */
function formatHMS(ms: number): string {
	const totalSec = Math.floor(Math.abs(ms) / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const timerLabel = $derived.by<string>(() => {
	switch (status) {
		case "cancelled":
			return "キャンセル済み";
		case "upcoming":
			return `開始まで ${formatHMS(scheduledMs - now)}`;
		case "live":
			return `経過 ${formatHMS(now - scheduledMs)}`;
		case "ended":
			return `終了（${data.event.duration_minutes}分間）`;
	}
});

// ── 投稿コンポーザー ─────────────────────────────────────────

let postContent = $state("");
const maxLen = 280;
const hashtagSuffix = ` #${data.event.hashtag}`;

// ハッシュタグを除いた実質文字数（上限チェック用）
const contentWithTag = $derived(
	postContent.includes(`#${data.event.hashtag}`) ? postContent : postContent + hashtagSuffix,
);
const charCount = $derived(contentWithTag.length);
const overLimit = $derived(charCount > maxLen);

// 投稿成功後にコンテンツをクリア
$effect(() => {
	if (form && "success" in form && form.success) postContent = "";
});

function formatDate(iso: string): string {
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

<svelte:head> <title>{data.event.title} — Anipolis</title> </svelte:head>

<div class="page-container">
	<div class="feed-column">
		<!-- ── イベントヘッダー ── -->
		<div class="card event-room-header">
			<div class="event-room-top">
				<div>
					<div class="event-room-hashtag">
						<a href="/hashtag/{data.event.hashtag}" class="hashtag-link"> #{data.event.hashtag} </a>
					</div>
					<h1 class="event-room-title">{data.event.title}</h1>
					{#if data.event.description}
						<p class="event-room-desc">{data.event.description}</p>
					{/if}
					<div class="event-room-meta">
						<time>{formatDate(data.event.scheduled_at)}</time>
						{#if data.event.duration_minutes}
							<span>・{data.event.duration_minutes}分</span>
						{/if}
						<span>・主催: @{data.event.creator_username}</span>
					</div>
				</div>
			</div>

			<!-- ── タイマー ── -->
			<div class="event-timer event-timer--{status}">
				<div class="event-timer-display">{timerLabel}</div>
				{#if status === 'live'}
					<div class="event-timer-badge">LIVE</div>
				{/if}
			</div>
		</div>

		<!-- ── 投稿コンポーザー ── -->
		{#if data.user && status !== 'cancelled'}
			<div class="card composer">
				{#if form && 'message' in form}
					<p class="form-error">{form.message}</p>
				{/if}
				<form method="POST" action="?/createPost" use:enhance>
					<input type="hidden" name="hashtag" value={data.event.hashtag}>
					<div class="composer-body">
						<textarea
							class="composer-textarea"
							name="content"
							placeholder="#{data.event.hashtag} で実況しよう..."
							rows="3"
							bind:value={postContent}
							maxlength={maxLen}
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
					<p class="composer-hint">投稿に <strong>#{data.event.hashtag}</strong> が自動で付与されます</p>
				</form>
			</div>
		{:else if !data.user}
			<div class="card" style="text-align:center; color:var(--color-muted); padding:20px;">
				実況するにはログインが必要です
			</div>
		{/if}

		<!-- ── 投稿フィード ── -->
		<div class="event-posts-header"><span class="event-posts-count">{data.posts.length}件の実況</span></div>

		{#if data.posts.length === 0}
			<div class="card" style="text-align:center; color:var(--color-muted); padding:32px;">
				まだ実況投稿はありません。<br>
				#{data.event.hashtag}
				で最初の実況をしよう！
			</div>
		{:else}
			{#each data.posts as post (post.id)}
				<PostCard {post} currentUserId={data.user?.id ?? null} />
			{/each}
		{/if}
	</div>

	<!-- サイドバー：トレンド -->
	<aside class="sidebar-column">
		<div style="margin-bottom:16px;">
			<a href="/calendar" class="btn btn-ghost" style="width:100%;"> ← カレンダーへ戻る </a>
		</div>
		<TrendingPanel trending={data.trending} />
	</aside>
</div>
