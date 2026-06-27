<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { Post } from "$lib/types";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();

type RoomStatus = "not_open" | "open" | "ended";
type PostOrder = "oldest" | "newest";

let now = $state(Date.now());
let intervalId: ReturnType<typeof setInterval>;
let postContent = $state("");
let textareaEl: HTMLTextAreaElement | null = $state(null);
let mounted = $state(false);
let postOrder = $state<PostOrder>("oldest");
let lastPostCount = $state(0);
let isFollowingLatest = $state(true);
let unreadNewPostCount = $state(0);
let programmaticScrollTimer: ReturnType<typeof setTimeout> | undefined;

const maxLen = 280;
const latestEdgeThreshold = 80;
const scheduledMs = $derived(new Date(data.room.scheduled_at).getTime());
const openMs = $derived(new Date(data.room.posting_opens_at).getTime());
const closeMs = $derived(new Date(data.room.posting_closes_at).getTime());
const openLeadMinutes = $derived(Math.round((scheduledMs - openMs) / (60 * 1000)));
const roomHref = $derived(`/rooms/anime/${data.anime.id}/${data.room.date}`);
const isGlobalLobby = $derived(data.room.kind === "global");
const hashtagSuffix = $derived(` #${data.room.hashtag}`);
const contentWithTag = $derived(
	postContent.includes(`#${data.room.hashtag}`) ? postContent : postContent + hashtagSuffix,
);
const charCount = $derived(contentWithTag.length);
const overLimit = $derived(charCount > maxLen);
// ライブ更新で受信した投稿（load 由来の data.posts とは別に保持し、ID でマージする）
let extraPosts = $state<Post[]>([]);
let roomExperimentVisitId: string | null = null;
let roomExperimentHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
let roomExperimentExitSent = false;

const allPosts = $derived.by(() => {
	if (extraPosts.length === 0) return data.posts;
	const seen = new Set(data.posts.map((p) => p.id));
	const fresh = extraPosts.filter((p) => !seen.has(p.id));
	if (fresh.length === 0) return data.posts;
	return [...data.posts, ...fresh].sort(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);
});

const displayedPosts = $derived(
	postOrder === "oldest"
		? allPosts
		: [...allPosts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
);

let fetchingLive = false;

function getRoomExperimentClientVisitKey(sessionId: string) {
	const storageKey = `room-experiment-visit:${sessionId}`;
	const existingKey = sessionStorage.getItem(storageKey);
	if (existingKey) return existingKey;
	const generatedKey = crypto.randomUUID();
	sessionStorage.setItem(storageKey, generatedKey);
	return generatedKey;
}

async function startRoomExperimentTracking() {
	const sessionId = data.roomExperiment?.sessionId;
	if (!data.user || !data.roomExperiment?.enabled || !sessionId) return;
	try {
		const res = await fetch("/api/room-experiment-visits", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				session_id: sessionId,
				client_visit_key: getRoomExperimentClientVisitKey(sessionId),
			}),
		});
		if (res.status === 204 || !res.ok) return;
		const body = (await res.json()) as {
			visit_id?: string;
			heartbeat_interval_ms?: number;
		};
		if (!body.visit_id) return;
		roomExperimentVisitId = body.visit_id;
		roomExperimentExitSent = false;
		const intervalMs = body.heartbeat_interval_ms ?? 30_000;
		roomExperimentHeartbeatTimer = setInterval(() => void sendRoomExperimentHeartbeat(), intervalMs);
	} catch {
		// Tracking is best-effort and must not affect room viewing.
	}
}

async function sendRoomExperimentHeartbeat() {
	if (!roomExperimentVisitId || roomExperimentExitSent) return;
	try {
		await fetch(`/api/room-experiment-visits/${roomExperimentVisitId}/heartbeat`, { method: "POST" });
	} catch {
		// Best-effort.
	}
}

function sendRoomExperimentExit() {
	if (!roomExperimentVisitId || roomExperimentExitSent) return;
	roomExperimentExitSent = true;
	if (roomExperimentHeartbeatTimer) {
		clearInterval(roomExperimentHeartbeatTimer);
		roomExperimentHeartbeatTimer = undefined;
	}
	const url = `/api/room-experiment-visits/${roomExperimentVisitId}/exit`;
	if (typeof navigator === "undefined") return;
	if (navigator.sendBeacon?.(url)) return;
	void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
}

/** 最後に受信した投稿以降の差分を取得して extraPosts に追加する */
async function fetchNewPosts() {
	if (fetchingLive) return;
	fetchingLive = true;
	try {
		const last = allPosts[allPosts.length - 1];
		const params = new URLSearchParams({ session_id: data.room.session_id });
		if (last) params.set("since", last.created_at);
		const res = await fetch(`/api/rooms/posts?${params}`);
		if (!res.ok) return;
		const body = (await res.json()) as { posts: Post[] };
		if (body.posts.length === 0) return;
		const seen = new Set(allPosts.map((p) => p.id));
		const fresh = body.posts.filter((p) => !seen.has(p.id));
		if (fresh.length > 0) extraPosts = [...extraPosts, ...fresh];
	} catch {
		// ネットワークエラーは次回の受信/ポーリングで回復する
	} finally {
		fetchingLive = false;
	}
}

const status = $derived.by<RoomStatus>(() => {
	if (now < openMs) return "not_open";
	if (now >= closeMs) return "ended";
	return "open";
});

onMount(() => {
	mounted = true;
	lastPostCount = data.posts.length;
	intervalId = setInterval(() => {
		now = Date.now();
	}, 1000);
	if (!("ontouchstart" in window) && textareaEl) {
		textareaEl.focus();
	}
	if (status === "open" && data.posts.length > 0) {
		void focusLatestPost();
	}
	window.addEventListener("scroll", handleWindowScroll, { passive: true });
	window.addEventListener("pagehide", sendRoomExperimentExit);
	void startRoomExperimentTracking();
});

onDestroy(() => {
	clearInterval(intervalId);
	if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
	if (roomExperimentHeartbeatTimer) clearInterval(roomExperimentHeartbeatTimer);
	if (typeof window !== "undefined") {
		window.removeEventListener("scroll", handleWindowScroll);
		window.removeEventListener("pagehide", sendRoomExperimentExit);
	}
	sendRoomExperimentExit();
});

$effect(() => {
	if (form && "success" in form && form.success) postContent = "";
});

$effect(() => {
	if (!mounted || status !== "open") return;
	if (allPosts.length === lastPostCount) return;
	const newPostCount = allPosts.length - lastPostCount;
	const shouldFollow = isFollowingLatest || isNearLatestEdge();
	lastPostCount = allPosts.length;
	if (allPosts.length === 0) return;
	if (shouldFollow) {
		isFollowingLatest = true;
		unreadNewPostCount = 0;
		void focusLatestPost(postOrder, "smooth");
	} else {
		unreadNewPostCount += Math.max(1, newPostCount);
	}
});

// 受付中はライブ更新: Realtime の INSERT を購読し、受信をトリガーに差分APIを叩く。
// Realtime が無効な環境向けに低頻度ポーリングをフォールバックとして併用する。
$effect(() => {
	if (!mounted || status !== "open") return;

	const channel = data.supabase
		.channel(`room-${data.room.session_id}`)
		.on(
			"postgres_changes",
			{
				event: "INSERT",
				schema: "public",
				table: "posts",
				filter: `broadcast_room_session_id=eq.${data.room.session_id}`,
			},
			() => void fetchNewPosts(),
		)
		.subscribe();
	const pollId = setInterval(() => void fetchNewPosts(), 15000);

	return () => {
		clearInterval(pollId);
		void data.supabase.removeChannel(channel);
	};
});

function isNearLatestEdge(order: PostOrder = postOrder) {
	const root = document.documentElement;
	if (order === "newest") return window.scrollY <= latestEdgeThreshold;
	const distanceToBottom = root.scrollHeight - (window.scrollY + window.innerHeight);
	return distanceToBottom <= latestEdgeThreshold;
}

function handleWindowScroll() {
	if (!mounted || status !== "open") return;
	if (programmaticScrollTimer) return;
	const nearLatest = isNearLatestEdge();
	isFollowingLatest = nearLatest;
	if (nearLatest) unreadNewPostCount = 0;
}

async function focusLatestPost(order: PostOrder = postOrder, behavior: ScrollBehavior = "auto") {
	await tick();
	requestAnimationFrame(() => {
		const selector = order === "oldest" ? ".anime-room-post:last-of-type" : ".anime-room-post:first-of-type";
		programmaticScrollTimer = setTimeout(() => {
			programmaticScrollTimer = undefined;
			isFollowingLatest = true;
		}, 450);
		document.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "center", behavior });
	});
}

function setPostOrder(order: PostOrder) {
	postOrder = order;
	isFollowingLatest = true;
	unreadNewPostCount = 0;
	if (status === "open" && allPosts.length > 0) void focusLatestPost(order);
}

function resumeLatestFollow() {
	isFollowingLatest = true;
	unreadNewPostCount = 0;
	if (allPosts.length > 0) void focusLatestPost(postOrder, "smooth");
}

function formatHMS(ms: number) {
	const totalSec = Math.floor(Math.abs(ms) / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const timerLabel = $derived.by(() => {
	if (isGlobalLobby) return "総合ロビーはいつでも投稿できます";
	if (status === "not_open") return `開場まで ${formatHMS(openMs - now)}`;
	if (status === "open" && now < scheduledMs) return `放送開始まで ${formatHMS(scheduledMs - now)}`;
	if (status === "open") return `投稿終了まで ${formatHMS(closeMs - now)}`;
	return "このルームは終了しました";
});

const broadcastMetaLine = $derived.by(() => {
	if (isGlobalLobby) return "総合実況・雑談ロビー";
	const station = data.anime.broadcast_station?.filter(Boolean).join(" / ");
	const frame = `${data.room.duration_minutes}分枠`;
	return station ? `${station} · ${frame}` : frame;
});

function formatCompactDate(iso: string) {
	const date = new Date(iso);
	const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	return `${month}/${day}(${weekdays[date.getDay()]}) ${hour}:${minute}`;
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
			<span class="event-posts-count">{allPosts.length}件の実況</span>
		</div>

		<div class="room-order-toggle" role="group" aria-label="投稿の表示順">
			<button
				type="button"
				class:active={postOrder === "oldest"}
				aria-pressed={postOrder === "oldest"}
				onclick={() => setPostOrder("oldest")}
			>
				古い順
			</button>
			<button
				type="button"
				class:active={postOrder === "newest"}
				aria-pressed={postOrder === "newest"}
				onclick={() => setPostOrder("newest")}
			>
				新しい順
			</button>
		</div>

		{#if allPosts.length === 0}
			<div class="card anime-room-empty">
				まだ実況投稿はありません。<br>
				#{data.room.hashtag}
				で最初の感想を残しましょう。
			</div>
		{:else}
			{#each displayedPosts as post (post.id)}
				<div class="anime-room-post">
					<PostCard
						{post}
						currentUserId={data.user?.id ?? null}
						insideRoom={true}
						roomContext={{ href: roomHref, title: `${data.anime.title} の放送ルーム` }}
						broadcastStartAt={data.room.scheduled_at}
					/>
				</div>
			{/each}
		{/if}

		{#if status === "open" && unreadNewPostCount > 0}
			<button type="button" class="new-posts-badge" onclick={resumeLatestFollow}>
				<span aria-hidden="true">↓</span>
				<span>新着の投稿があります</span>
				<span class="new-posts-count">{unreadNewPostCount}</span>
			</button>
		{/if}
	</div>

	<aside class="sidebar-column">
		<div class="room-summary-card mb-4 rounded-xl border p-4 shadow-sm">
			<div class="flex items-start">
				<a href="/anime/{data.anime.id}" class="shrink-0" aria-label="アニメ詳細を開く">
					{#if data.anime.cover_url}
						<img src={data.anime.cover_url} alt={data.anime.title} class="block w-16 rounded-lg shadow-md">
					{:else}
						<div class="room-summary-placeholder h-20 w-16 rounded-lg border shadow-md"></div>
					{/if}
				</a>
				<div class="flex min-h-20 min-w-0 flex-1 flex-col justify-between pl-3">
					<div class="min-w-0">
						<h1 class="room-summary-title line-clamp-1 text-sm font-bold">{data.room.title}</h1>
						<div class="mt-2 flex min-w-0 items-center gap-2">
							{#if status === "ended"}
								<span class="room-summary-status rounded px-1.5 py-0.5 text-[10px] font-bold"
									>終了</span
								>
							{/if}
							<time class="room-summary-secondary truncate text-xs"
								>{formatCompactDate(data.room.scheduled_at)}</time
							>
						</div>
						<div class="room-summary-muted mt-1 truncate text-xs">{broadcastMetaLine}</div>
					</div>
					<div class="mt-2 flex items-center justify-between gap-2">
						<a href="/hashtag/{data.room.hashtag}" class="room-summary-link truncate text-xs">
							#{data.room.hashtag}
						</a>
						<a href="/schedule" class="room-summary-back shrink-0 text-xs transition-colors">
							← 週間スケジュールへ戻る
						</a>
					</div>
				</div>
			</div>
		</div>

		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.room-summary-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
}

.room-summary-placeholder {
	background: var(--color-surface-hover);
	border-color: var(--color-border);
}

.room-summary-title {
	color: var(--color-text);
}

.room-summary-status {
	background: var(--color-surface-hover);
	color: var(--color-text-secondary);
}

.room-summary-secondary {
	color: var(--color-text-secondary);
}

.room-summary-muted,
.room-summary-back {
	color: var(--color-text-muted);
}

.room-summary-link {
	color: var(--color-accent);
}

.room-summary-link:hover,
.room-summary-back:hover {
	color: var(--color-accent-hover);
}

.feed-column {
	display: flex;
	flex-direction: column;
}

.room-mobile-bar {
	order: 0;
}

.event-posts-header,
.room-order-toggle {
	order: 1;
}

.anime-room-empty,
.anime-room-post {
	order: 2;
}

.new-posts-badge {
	position: fixed;
	left: 50%;
	bottom: 24px;
	z-index: 145;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	max-width: calc(100vw - 32px);
	padding: 9px 14px;
	border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-surface) 92%, var(--color-primary));
	box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
	color: var(--color-primary);
	font-size: 13px;
	font-weight: 700;
	line-height: 1.2;
	transform: translateX(-50%);
	animation: new-posts-pop 160ms ease-out;
}

.new-posts-badge:hover {
	background: color-mix(in srgb, var(--color-surface) 84%, var(--color-primary));
}

.new-posts-count {
	display: grid;
	min-width: 20px;
	height: 20px;
	place-items: center;
	padding: 0 6px;
	border-radius: 999px;
	background: var(--color-primary);
	color: white;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}

@keyframes new-posts-pop {
	from {
		opacity: 0;
		transform: translate(-50%, 8px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translate(-50%, 0) scale(1);
	}
}

.room-order-toggle {
	display: inline-flex;
	align-self: flex-start;
	gap: 2px;
	padding: 3px;
	margin: -4px 0 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
}

.room-order-toggle button {
	min-width: 78px;
	padding: 6px 10px;
	border-radius: 6px;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 600;
	line-height: 1.2;
}

.room-order-toggle button.active {
	background: var(--color-accent);
	color: white;
}

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

	.new-posts-badge {
		bottom: calc(76px + env(safe-area-inset-bottom));
	}
}

/* ── ログイン/空状態 ── */
.anime-room-login,
.anime-room-empty {
	text-align: center;
	color: var(--color-text-muted);
	padding: 24px;
}

/* ── スケジュールへ戻るボタン ── */
.feed-column > .composer,
.feed-column > .anime-room-login {
	order: 3;
	margin-top: 16px;
}

.feed-column > .composer {
	margin-bottom: 0;
}
</style>
