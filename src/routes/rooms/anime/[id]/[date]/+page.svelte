<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onDestroy, onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import ExitSurveyModal from "$lib/components/ExitSurveyModal.svelte";
import LiveRoomPostCard from "$lib/components/LiveRoomPostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { Post, RoomExitSurveyComparisonWithX, RoomExitSurveyNextParticipation } from "$lib/types";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();

type RoomStatus = "not_open" | "open" | "ended";
type PostOrder = "oldest" | "newest";

let now = $state(Date.now());
let intervalId: ReturnType<typeof setInterval>;
let postContent = $state("");
let textareaEl: HTMLTextAreaElement | null = $state(null);
let composerEl: HTMLDivElement | null = $state(null);
let keepComposerFocused = $state(true);
let postListEl: HTMLDivElement | null = $state(null);
let mounted = $state(false);
let isMobileViewport = $state(false);
let postOrder = $state<PostOrder>("oldest");
let lastPostCount = $state(0);
let isFollowingLatest = $state(true);
let unreadNewPostCount = $state(0);
let enteredAt = Date.now();
let localSurveyPostCount = $state(0);
let surveyOpen = $state(false);
let surveyHandled = $state(false);
let surveySubmitting = $state(false);
let surveyErrorMessage: string | null = $state(null);
let programmaticScrollTimer: ReturnType<typeof setTimeout> | undefined;

const maxLen = 280;
const latestEdgeThreshold = 80;
const scheduledMs = $derived(new Date(data.room.scheduled_at).getTime());
const openMs = $derived(new Date(data.room.posting_opens_at).getTime());
const closeMs = $derived(new Date(data.room.posting_closes_at).getTime());
const openLeadMinutes = $derived(Math.round((scheduledMs - openMs) / (60 * 1000)));
const isGlobalLobby = $derived(data.room.kind === "global");
const roomNameLabel = $derived(
	data.room.title.startsWith(data.anime.title)
		? data.room.title.slice(data.anime.title.length).trim()
		: data.room.title,
);
const charCount = $derived(postContent.length);
const overLimit = $derived(charCount > maxLen);
const surveyPostCount = $derived(data.roomExitSurvey.postCount + localSurveyPostCount);
// ライブ更新で受信した投稿（load 由来の data.posts とは別に保持し、ID でマージする）
let extraPosts = $state<Post[]>([]);
let roomExperimentVisitId: string | null = null;
let roomExperimentHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
let roomExperimentExitSent = false;
let mobileViewportQuery: MediaQueryList | null = null;

function getRoomExperimentVisitStorageKey(sessionId: string) {
	return `room-experiment-visit:${sessionId}`;
}

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
	const storageKey = getRoomExperimentVisitStorageKey(sessionId);
	const existingKey = sessionStorage.getItem(storageKey);
	if (existingKey) return existingKey;
	const generatedKey = crypto.randomUUID();
	sessionStorage.setItem(storageKey, generatedKey);
	return generatedKey;
}

function clearRoomExperimentHeartbeatTimer() {
	if (!roomExperimentHeartbeatTimer) return;
	clearInterval(roomExperimentHeartbeatTimer);
	roomExperimentHeartbeatTimer = undefined;
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
		clearRoomExperimentHeartbeatTimer();
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
	clearRoomExperimentHeartbeatTimer();
	const url = `/api/room-experiment-visits/${roomExperimentVisitId}/exit`;
	const sessionId = data.roomExperiment?.sessionId;
	if (sessionId) sessionStorage.removeItem(getRoomExperimentVisitStorageKey(sessionId));
	if (typeof navigator === "undefined") return;
	if (navigator.sendBeacon?.(url)) return;
	void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
}

function getStayedSeconds() {
	return Math.max(0, Math.floor((Date.now() - enteredAt) / 1000));
}

function shouldShowExitSurvey() {
	if (surveyHandled) return false;
	if (!data.user) return false;
	if (!data.roomExitSurvey.experimentRunId) return false;
	if (data.roomExitSurvey.alreadyAnswered) return false;
	return getStayedSeconds() >= 180 || surveyPostCount >= 1;
}

async function leaveRoom() {
	sendRoomExperimentExit();
	await goto("/");
}

async function handleExitRoom() {
	if (shouldShowExitSurvey()) {
		surveyErrorMessage = null;
		surveyOpen = true;
		return;
	}
	surveyHandled = true;
	await leaveRoom();
}

type RoomExitSurveySubmitAnswers = {
	overallRating: number;
	sharedExperienceRating: number;
	readabilityRating: number;
	nextParticipation: RoomExitSurveyNextParticipation;
	comparisonWithX: RoomExitSurveyComparisonWithX;
	goodPoints: string | null;
	improvementPoints: string | null;
};

async function postRoomExitSurvey(action: "submit" | "skip", answers?: RoomExitSurveySubmitAnswers) {
	const res = await fetch("/api/room-exit-surveys", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			action,
			anime_id: data.anime.id,
			broadcast_room_session_id: data.room.session_id,
			experiment_run_id: data.roomExitSurvey.experimentRunId,
			survey_version: data.roomExitSurvey.surveyVersion,
			stayed_seconds: getStayedSeconds(),
			post_count: surveyPostCount,
			...(answers ? { answers } : {}),
		}),
	});
	if (!res.ok) throw new Error(`room exit survey failed: ${res.status}`);
}

async function handleSurveySubmit(answers: RoomExitSurveySubmitAnswers) {
	if (surveySubmitting) return;
	surveySubmitting = true;
	surveyErrorMessage = null;
	try {
		await postRoomExitSurvey("submit", answers);
		surveyHandled = true;
		surveyOpen = false;
		await leaveRoom();
	} catch (error) {
		console.error("room exit survey submit failed:", error);
		surveyErrorMessage = "送信に失敗しました。通信状況を確認してもう一度お試しください。";
	} finally {
		surveySubmitting = false;
	}
}

async function handleSurveySkip() {
	if (surveySubmitting) return;
	surveySubmitting = true;
	surveyErrorMessage = null;
	try {
		await postRoomExitSurvey("skip");
	} catch (error) {
		console.error("room exit survey skip failed:", error);
	} finally {
		surveyHandled = true;
		surveySubmitting = false;
		surveyOpen = false;
		await leaveRoom();
	}
}

function handleRoomExperimentPageHide(event: PageTransitionEvent) {
	if (event.persisted) {
		clearRoomExperimentHeartbeatTimer();
		return;
	}
	sendRoomExperimentExit();
}

function handleRoomExperimentPageShow(event: PageTransitionEvent) {
	if (event.persisted) void startRoomExperimentTracking();
}

function shouldAutoFocusComposer() {
	return !("ontouchstart" in window) && navigator.maxTouchPoints === 0;
}

function canAutoRefocusComposer() {
	if (!shouldAutoFocusComposer() || !keepComposerFocused) return false;
	const activeElement = document.activeElement;
	return (
		!activeElement ||
		activeElement === document.body ||
		activeElement === textareaEl ||
		(composerEl?.contains(activeElement) ?? false)
	);
}

async function focusComposerTextarea(options: FocusOptions = {}) {
	if (!canAutoRefocusComposer()) return;
	await tick();
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
	textareaEl?.focus(options);
}

function handleWindowPointerDown(event: PointerEvent) {
	const target = event.target;
	if (!(target instanceof Node)) return;
	if (target === textareaEl) {
		keepComposerFocused = true;
		return;
	}
	const targetElement = target instanceof Element ? target : target.parentElement;
	if (composerEl?.contains(target) && targetElement?.closest('button[type="submit"]')) return;
	keepComposerFocused = false;
}

const handleCreatePost: SubmitFunction = () => {
	keepComposerFocused = true;
	return async ({ result, update }) => {
		await update({ reset: false });
		if (result.type === "success") localSurveyPostCount += 1;
		await focusComposerTextarea({ preventScroll: true });
	};
};

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
const showLatestJumpButton = $derived(status === "open" && (!isFollowingLatest || unreadNewPostCount > 0));

onMount(() => {
	mobileViewportQuery = window.matchMedia("(max-width: 960px)");
	isMobileViewport = mobileViewportQuery.matches;
	mobileViewportQuery.addEventListener("change", handleMobileViewportChange);
	mounted = true;
	lastPostCount = data.posts.length;
	intervalId = setInterval(() => {
		now = Date.now();
	}, 1000);
	if (status === "open" && data.posts.length > 0) {
		void focusLatestPost().then(() => focusComposerTextarea({ preventScroll: true }));
	} else {
		void focusComposerTextarea();
	}
	window.addEventListener("pointerdown", handleWindowPointerDown, true);
	window.addEventListener("pagehide", handleRoomExperimentPageHide);
	window.addEventListener("pageshow", handleRoomExperimentPageShow);
	void startRoomExperimentTracking();
});

onDestroy(() => {
	mobileViewportQuery?.removeEventListener("change", handleMobileViewportChange);
	clearInterval(intervalId);
	if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
	clearRoomExperimentHeartbeatTimer();
	if (typeof window !== "undefined") {
		window.removeEventListener("pointerdown", handleWindowPointerDown, true);
		window.removeEventListener("pagehide", handleRoomExperimentPageHide);
		window.removeEventListener("pageshow", handleRoomExperimentPageShow);
	}
	sendRoomExperimentExit();
});

function handleMobileViewportChange(event: MediaQueryListEvent) {
	isMobileViewport = event.matches;
}

$effect(() => {
	if (form && "success" in form && form.success) {
		postContent = "";
	}
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
		void focusLatestPost(postOrder, "smooth").then(() => focusComposerTextarea({ preventScroll: true }));
	} else {
		unreadNewPostCount += Math.max(1, newPostCount);
		void focusComposerTextarea({ preventScroll: true });
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
	if (!postListEl) return true;
	if (order === "newest") return postListEl.scrollTop <= latestEdgeThreshold;
	const distanceToBottom = postListEl.scrollHeight - (postListEl.scrollTop + postListEl.clientHeight);
	return distanceToBottom <= latestEdgeThreshold;
}

function handlePostListScroll() {
	if (!mounted || status !== "open") return;
	if (programmaticScrollTimer) return;
	const nearLatest = isNearLatestEdge();
	isFollowingLatest = nearLatest;
	if (nearLatest) unreadNewPostCount = 0;
}

async function focusLatestPost(order: PostOrder = postOrder, behavior: ScrollBehavior = "auto") {
	await tick();
	requestAnimationFrame(() => {
		if (!postListEl) return;
		if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
		programmaticScrollTimer = setTimeout(() => {
			programmaticScrollTimer = undefined;
			isFollowingLatest = true;
		}, 450);
		postListEl.scrollTo({
			top: order === "oldest" ? postListEl.scrollHeight : 0,
			behavior,
		});
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
	if (isGlobalLobby) return "";
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

<div class="page-container room-page-container">
	<div class="feed-column">
		<div class="room-mobile-bar">
			<span class="room-mobile-title"
				><a href="/anime/{data.anime.id}" class="anime-title-link">{data.anime.title}</a
				><span class="hierarchy-separator"> ❯ </span><span class="room-name-label">{roomNameLabel}</span></span
			>
			{#if !isGlobalLobby && status !== "ended"}
				<span class="room-mobile-timer event-timer--{status}">{timerLabel}</span>
				{#if status === "open"}
					<span class="event-timer-badge">受付中</span>
				{/if}
			{/if}
			<button type="button" class="room-mobile-exit" onclick={handleExitRoom} aria-label="退出する">
				<span class="i-lucide-log-out" aria-hidden="true"></span>
				<span>退出</span>
			</button>
		</div>

		{#if data.user && status === "open"}
			<div class="card composer" bind:this={composerEl}>
				{#if form && "message" in form}
					<p class="form-error">{form.message}</p>
				{/if}
				<form method="POST" action="?/createPost" use:enhance={handleCreatePost}>
					<div class="composer-body">
						<textarea
							bind:this={textareaEl}
							class="composer-textarea room-composer-textarea"
							name="content"
							placeholder={isMobileViewport ? "いまの感想を投稿..." : "いまの感想を投稿... (Shift+Enterで改行)"}
							rows={isMobileViewport ? 1 : 3}
							enterkeyhint="send"
							bind:value={postContent}
							maxlength={maxLen}
							onfocus={() => {
								keepComposerFocused = true;
							}}
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
				このルームの投稿受付は終了しました。<a href="/?quote_anime={data.anime.id}">引用投稿で感想を残す</a>
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
				時系列順
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

		<div class="room-post-list-shell">
			<div class="room-post-list scrollbar-thin-muted" bind:this={postListEl} onscroll={handlePostListScroll}>
				{#if allPosts.length === 0}
					<div class="card anime-room-empty">まだ投稿はありません。最初の感想を残しましょう。</div>
				{:else}
					{#each displayedPosts as post (post.id)}
						<div class="anime-room-post">
							<LiveRoomPostCard
								{post}
								currentUserId={data.user?.id ?? null}
								broadcastStartAt={data.room.scheduled_at}
								timelineTimeMode={isGlobalLobby}
							/>
						</div>
					{/each}
				{/if}
			</div>

			{#if showLatestJumpButton}
				<button
					type="button"
					class="new-posts-badge"
					onclick={resumeLatestFollow}
					aria-label="最新の投稿へ移動"
				>
					{#if postOrder === "oldest"}
						<span class="i-lucide-arrow-down latest-jump-icon" aria-hidden="true"></span>
					{:else}
						<span class="i-lucide-arrow-up latest-jump-icon" aria-hidden="true"></span>
					{/if}
					{#if unreadNewPostCount > 0}
						<span class="new-posts-count">{unreadNewPostCount}</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<aside class="sidebar-column scrollbar-thin-muted">
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
						<h1 class="room-summary-title text-sm font-bold">
							<a href="/anime/{data.anime.id}" class="anime-title-link">{data.anime.title}</a
							><span class="hierarchy-separator"> ❯ </span
							><span class="room-name-label">{roomNameLabel}</span>
						</h1>
						{#if !isGlobalLobby}
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
						{/if}
						{#if broadcastMetaLine}
							<div class="room-summary-muted mt-1 truncate text-xs">{broadcastMetaLine}</div>
						{/if}
					</div>
					<div class="mt-2 flex items-center justify-end gap-2">
						<button
							type="button"
							class="room-summary-exit shrink-0 text-xs transition-colors"
							onclick={handleExitRoom}
						>
							退出する
						</button>
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

{#if surveyOpen}
	<ExitSurveyModal
		submitting={surveySubmitting}
		errorMessage={surveyErrorMessage}
		onSubmit={handleSurveySubmit}
		onSkip={handleSurveySkip}
	/>
{/if}

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
	display: inline-flex;
	align-items: center;
	min-width: 0;
	overflow: hidden;
	color: var(--color-text);
}

.room-name-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.anime-title-link {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	text-decoration: none;
	color: inherit;
	padding: 4px 2px;
	margin: -4px -2px;
	transition: opacity 0.2s;
}

.anime-title-link:hover,
.anime-title-link:active {
	opacity: 0.7;
}

.hierarchy-separator {
	flex-shrink: 0;
	font-size: 0.85em;
	color: var(--color-text-muted);
	margin: 0 4px;
}

.room-summary-status {
	background: var(--color-surface-hover);
	color: var(--color-text-secondary);
}

.room-summary-secondary {
	color: var(--color-text-secondary);
}

.room-summary-muted,
.room-summary-exit {
	color: var(--color-text-muted);
}

.room-summary-exit {
	border: 0;
	background: transparent;
	padding: 0;
	font: inherit;
	cursor: pointer;
}

.room-summary-back {
	display: none;
}

.room-summary-exit:hover {
	color: var(--color-accent-hover);
}

.room-page-container {
	max-width: none;
	height: 100dvh;
	margin: 0;
	align-items: stretch;
	overflow: hidden;
	padding-right: max(24px, env(safe-area-inset-right));
	padding-bottom: 24px;
	padding-left: max(16px, calc((100% - (var(--content-max) + 48px)) / 2 + 16px));
}

.room-page-container > .feed-column {
	display: flex;
	flex: 0 0 var(--feed-width);
	height: 100%;
	min-height: 0;
	overflow: hidden;
	flex-direction: column;
}

.room-page-container > .sidebar-column {
	flex: 1 1 var(--sidebar-width);
	max-height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
	padding-bottom: 24px;
}

.room-mobile-bar {
	order: 0;
}

.event-posts-header,
.room-order-toggle {
	order: 1;
	flex: 0 0 auto;
}

.room-post-list-shell {
	position: relative;
	order: 2;
	flex: 1 1 auto;
	min-height: 0;
}

.room-post-list {
	height: 100%;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
}

.new-posts-badge {
	position: absolute;
	left: 50%;
	bottom: 12px;
	z-index: 4;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 40px;
	min-height: 40px;
	max-width: calc(100% - 32px);
	padding: 8px 12px;
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

.latest-jump-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
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
	margin: -4px 0 10px;
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
	display: inline-flex;
	align-items: center;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-text);
	overflow: hidden;
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
.room-mobile-exit {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
	border: 0;
	background: transparent;
	color: var(--color-text-muted);
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	cursor: pointer;
}
.room-mobile-exit:hover {
	color: var(--color-accent-hover);
}
.room-mobile-timer.event-timer--open {
	color: var(--color-primary);
	font-weight: 600;
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
	position: relative;
	z-index: 2;
	flex: 0 0 auto;
	margin-top: 12px;
}

.feed-column > .composer,
.feed-column > .anime-room-login {
	margin-bottom: 24px;
}

@media (max-width: 960px) {
	.room-page-container {
		height: calc(100dvh - 52px);
		padding-right: 12px;
		padding-bottom: calc(80px + env(safe-area-inset-bottom));
		padding-left: 12px;
	}

	.room-page-container > .feed-column {
		flex: 1 1 auto;
	}

	.room-mobile-bar {
		display: flex;
	}

	.room-page-container .room-post-list {
		padding-bottom: 14px;
	}

	.room-page-container .new-posts-badge {
		bottom: 8px;
	}

	.room-page-container .feed-column > .composer {
		margin-top: 8px;
		margin-bottom: 0;
		padding: 8px 10px;
		border-radius: 14px;
	}

	.room-page-container .composer form,
	.room-page-container .composer-body {
		min-width: 0;
		width: 100%;
	}

	.room-page-container .composer-body {
		align-items: center;
		gap: 8px;
	}

	.room-page-container .composer-textarea {
		min-height: 24px;
		max-height: 80px;
		height: 24px;
		line-height: 1.5;
		font-size: 15px;
		overflow-y: auto;
	}

	.room-page-container .composer-footer {
		flex: 0 0 auto;
		gap: 8px;
		margin-top: 0;
		padding-top: 0;
		border-top: 0;
	}

	.room-page-container .composer-footer .char-count {
		font-size: 12px;
		line-height: 1;
	}

	.room-page-container .composer-footer .btn {
		min-height: 32px;
		padding: 6px 12px;
		white-space: nowrap;
	}
}

@media (max-width: 480px) {
	.room-page-container {
		padding-right: 8px;
		padding-left: 8px;
	}
}

@media (max-width: 375px) {
	.room-page-container {
		padding-right: 6px;
		padding-left: 6px;
	}
}
</style>
