<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { trapFocus } from "$lib/actions/trapFocus";
import type { Post } from "$lib/types";
import { formatBroadcastRelativeTime, formatRelativeTime } from "$lib/utils/format";
import { parseContentParts } from "$lib/utils/hashtag";
import BroadcastTimestamp from "./BroadcastTimestamp.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	broadcastStartAt?: string | null;
	timelineTimeMode?: boolean;
}

let { post, currentUserId = null, broadcastStartAt = null, timelineTimeMode = false }: Props = $props();

let expanded = $state(false);
let likeCountLocal = $state<number | null>(null);
let likedByMeLocal = $state<boolean | null>(null);
let repostCountLocal = $state<number | null>(null);
let repostedByMeLocal = $state<boolean | null>(null);
let bookmarkedByMeLocal = $state<boolean | null>(null);
let showKebabMenu = $state(false);
let showDeleteModal = $state(false);
let showReportModal = $state(false);
let deleteFormEl = $state<HTMLFormElement | null>(null);
let deleting = $state(false);
let deleteMessage = $state("");
let reportReason = $state("spam");
let reportDetails = $state("");
let reportSubmitting = $state(false);
let reportMessage = $state("");
let replies = $state<Post[]>([]);
let repliesLoaded = $state(false);
let allRepliesLoaded = $state(false);
let repliesLoading = $state(false);
let repliesError = $state("");

const parts = $derived(parseContentParts(post.content));
const displayName = $derived(post.display_name || post.username);
const isOwn = $derived(!!currentUserId && currentUserId === post.user_id);
const isLoggedIn = $derived(!!currentUserId);
const likeCount = $derived(likeCountLocal ?? post.like_count);
const likedByMe = $derived(likedByMeLocal ?? post.liked_by_me);
const repostCount = $derived(repostCountLocal ?? post.repost_count);
const repostedByMe = $derived(repostedByMeLocal ?? post.reposted_by_me);
const bookmarkedByMe = $derived(bookmarkedByMeLocal ?? post.bookmarked_by_me);
const relativeTime = $derived(formatRelativeTime(post.created_at));
const broadcastRelativeTime = $derived(
	broadcastStartAt ? formatBroadcastRelativeTime(post.created_at, broadcastStartAt) : null,
);
const absoluteTimeStr = $derived(
	new Date(post.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
);
const remainingReplyCount = $derived(Math.max(post.reply_count - replies.length, 0));

function stop(event: Event) {
	event.stopPropagation();
}

function isInteractiveEventTarget(event: Event) {
	const target = event.target;
	return target instanceof Element && !!target.closest("a, button, input, textarea, select, label, form");
}

async function toggleExpanded() {
	expanded = !expanded;
	showKebabMenu = false;
	if (expanded) await loadRecentReplies();
}

function handleRowClick(event: MouseEvent) {
	if (isInteractiveEventTarget(event)) return;
	void toggleExpanded();
}

function handleRowKeydown(event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	if (isInteractiveEventTarget(event)) return;
	event.preventDefault();
	void toggleExpanded();
}

async function loadRecentReplies() {
	if (repliesLoaded || post.reply_count <= 0 || repliesLoading) return;
	if (await fetchReplies("recent", 3)) {
		repliesLoaded = true;
		allRepliesLoaded = post.reply_count <= replies.length;
	}
}

async function loadAllReplies(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	if (await fetchReplies("all", 100)) {
		repliesLoaded = true;
		allRepliesLoaded = true;
	}
}

async function fetchReplies(mode: "recent" | "all", limit: number): Promise<boolean> {
	repliesLoading = true;
	repliesError = "";
	try {
		const params = new URLSearchParams({ mode, limit: String(limit) });
		const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies?${params}`);
		const body = (await response.json().catch(() => ({}))) as { replies?: Post[]; message?: string };
		if (!response.ok) {
			repliesError = body.message ?? "返信を読み込めませんでした";
			return false;
		}
		replies = body.replies ?? [];
		return true;
	} catch {
		repliesError = "返信を読み込めませんでした";
		return false;
	} finally {
		repliesLoading = false;
	}
}

const handleLike: SubmitFunction = () => {
	const wasLiked = likedByMe;
	likedByMeLocal = !wasLiked;
	likeCountLocal = wasLiked ? likeCount - 1 : likeCount + 1;
	return async ({ result, update }) => {
		if (result.type === "failure" || result.type === "error") {
			likedByMeLocal = null;
			likeCountLocal = null;
		}
		await update({ reset: false });
	};
};

const handleBookmark: SubmitFunction = () => {
	const wasBookmarked = bookmarkedByMe;
	bookmarkedByMeLocal = !wasBookmarked;
	return async ({ result, update }) => {
		if (result.type === "failure" || result.type === "error") bookmarkedByMeLocal = null;
		await update({ reset: false });
	};
};

const handleRepost: SubmitFunction = () => {
	const wasReposted = repostedByMe;
	repostedByMeLocal = !wasReposted;
	repostCountLocal = wasReposted ? repostCount - 1 : repostCount + 1;
	return async ({ result, update }) => {
		if (result.type === "failure" || result.type === "error") {
			repostedByMeLocal = null;
			repostCountLocal = null;
		}
		await update({ reset: false });
	};
};

const handleDelete: SubmitFunction = () => {
	deleting = true;
	deleteMessage = "";
	return async ({ result, update }) => {
		if (result.type === "failure" || result.type === "error") {
			const data = result.type === "failure" ? (result.data as { message?: string } | undefined) : undefined;
			deleteMessage = data?.message ?? "投稿の削除に失敗しました";
			await update({ reset: false });
			deleting = false;
			return;
		}
		await update();
		showDeleteModal = false;
		deleting = false;
	};
};

async function submitReport(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	reportSubmitting = true;
	reportMessage = "";
	try {
		const fd = new FormData();
		fd.append("target_type", "post");
		fd.append("target_id", post.id);
		fd.append("reason", reportReason);
		fd.append("details", reportDetails.trim());

		const response = await fetch("/api/reports", { method: "POST", body: fd });
		const body = (await response.json().catch(() => ({}))) as { message?: string };
		if (!response.ok) {
			reportMessage = body.message ?? "通報の送信に失敗しました";
			return;
		}
		reportMessage = "通報を受け付けました";
		reportDetails = "";
		setTimeout(() => {
			showReportModal = false;
			reportMessage = "";
		}, 900);
	} catch {
		reportMessage = "通報の送信に失敗しました";
	} finally {
		reportSubmitting = false;
	}
}
</script>

<article class="live-post-card" class:expanded class:deleting>
	{#if isOwn}
		<form
			method="POST"
			action="?/deletePost"
			use:enhance={handleDelete}
			bind:this={deleteFormEl}
			style="display:none"
		>
			<input type="hidden" name="post_id" value={post.id}>
		</form>
	{/if}

	<div
		class="live-post-row"
		role="button"
		tabindex="0"
		aria-expanded={expanded}
		onclick={handleRowClick}
		onkeydown={handleRowKeydown}
	>
		<a href="/profile/{post.username}" class="live-avatar" aria-label={displayName} onclick={stop}>
			<UserAvatar src={post.avatar_url} username={post.username} size="xs" />
		</a>
		<span class="live-meta">
			<a href="/profile/{post.username}" class="live-name" onclick={stop}>{displayName}</a>
			<a href="/profile/{post.username}" class="live-username" onclick={stop}>@{post.username}</a>
		</span>
		<p class="live-content">
			{#each parts as part}
				{#if part.type === 'hashtag'}
					<a href="/hashtag/{part.value}" class="live-link" onclick={stop}>#{part.value}</a>
				{:else if part.type === 'mention'}
					<a href="/profile/{part.value}" class="live-link" onclick={stop}>@{part.value}</a>
				{:else}
					{part.value}
				{/if}
			{/each}
		</p>
		<span class="live-time">
			{#if timelineTimeMode}
				<time datetime={post.created_at} title={absoluteTimeStr}>{relativeTime}</time>
			{:else if broadcastRelativeTime}
				<BroadcastTimestamp relativeTime={broadcastRelativeTime} absoluteTime={absoluteTimeStr} />
			{:else}
				<time datetime={post.created_at} title={absoluteTimeStr}>{relativeTime}</time>
				<span class="live-time-abs">({absoluteTimeStr})</span>
			{/if}
		</span>
		{#if expanded}
			<button
				type="button"
				class="live-collapse"
				aria-label="閉じる"
				onclick={(event) => { event.stopPropagation(); void toggleExpanded(); }}
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="m18 15-6-6-6 6" />
				</svg>
			</button>
		{:else}
			<form method="POST" action="?/like" use:enhance={handleLike} class="live-like-form">
				<input type="hidden" name="post_id" value={post.id}>
				<button
					type="submit"
					class="live-like"
					class:active={likedByMe}
					disabled={!isLoggedIn}
					aria-pressed={likedByMe}
					aria-label={likedByMe ? 'いいねを取り消す' : 'いいね'}
					onclick={stop}
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill={likedByMe ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
						/>
					</svg>
					<span>{likeCount}</span>
				</button>
			</form>
		{/if}
	</div>

	{#if expanded}
		<div class="live-detail">
			<div class="live-actions" aria-label="投稿アクション">
				<a href="/posts/{post.id}" class="live-action live-action-reply" aria-label="返信">
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
					</svg>
					{#if post.reply_count > 0}
						<span>{post.reply_count}</span>
					{/if}
				</a>
				<form method="POST" action="?/repost" use:enhance={handleRepost}>
					<input type="hidden" name="post_id" value={post.id}>
					<button
						type="submit"
						class="live-action live-action-repost"
						class:active={repostedByMe}
						disabled={!isLoggedIn}
						aria-pressed={repostedByMe}
						aria-label={repostedByMe ? "リポストを取り消す" : "リポスト"}
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M17 1l4 4-4 4" />
							<path d="M3 11V9a4 4 0 0 1 4-4h14" />
							<path d="M7 23l-4-4 4-4" />
							<path d="M21 13v2a4 4 0 0 1-4 4H3" />
						</svg>
						{#if repostCount > 0}
							<span>{repostCount}</span>
						{/if}
					</button>
				</form>
				<form method="POST" action="?/like" use:enhance={handleLike}>
					<input type="hidden" name="post_id" value={post.id}>
					<button
						type="submit"
						class="live-action live-action-like"
						class:active={likedByMe}
						disabled={!isLoggedIn}
						aria-pressed={likedByMe}
						aria-label={likedByMe ? "いいねを取り消す" : "いいね"}
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill={likedByMe ? 'currentColor' : 'none'}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
							/>
						</svg>
						{#if likeCount > 0}
							<span>{likeCount}</span>
						{/if}
					</button>
				</form>
				<form method="POST" action="?/bookmark" use:enhance={handleBookmark}>
					<input type="hidden" name="post_id" value={post.id}>
					<button
						type="submit"
						class="live-action live-action-bookmark"
						class:active={bookmarkedByMe}
						disabled={!isLoggedIn}
						aria-pressed={bookmarkedByMe}
						aria-label={bookmarkedByMe ? "ブックマークを解除" : "ブックマーク"}
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill={bookmarkedByMe ? 'currentColor' : 'none'}
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
						</svg>
					</button>
				</form>
				{#if isLoggedIn}
					<div class="live-menu-wrap">
						<button
							type="button"
							class="live-action"
							aria-label="メニュー"
							aria-haspopup="true"
							aria-expanded={showKebabMenu}
							onclick={(event) => { event.stopPropagation(); showKebabMenu = !showKebabMenu; }}
						>
							<span class="i-lucide-ellipsis-vertical" aria-hidden="true"></span>
						</button>
						{#if showKebabMenu}
							<div class="live-menu">
								{#if isOwn}
									<button
										type="button"
										class="live-menu-item danger"
										onclick={(event) => { event.stopPropagation(); showKebabMenu = false; showDeleteModal = true; }}
									>
										削除
									</button>
								{:else}
									<button
										type="button"
										class="live-menu-item"
										onclick={(event) => { event.stopPropagation(); showKebabMenu = false; showReportModal = true; }}
									>
										通報
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="live-replies">
				{#if repliesLoading}
					<p class="live-reply-status">返信を読み込み中...</p>
				{:else if repliesError}
					<p class="live-reply-status live-reply-error">{repliesError}</p>
				{:else if replies.length > 0}
					{#each replies as reply (reply.id)}
						<a href="/posts/{reply.id}" class="live-reply" onclick={stop}>
							<UserAvatar src={reply.avatar_url} username={reply.username} size="xs" />
							<span class="live-reply-name">{reply.display_name || reply.username}</span>
							<span class="live-reply-text">{reply.content}</span>
							<time class="live-reply-time" datetime={reply.created_at}
								>{formatRelativeTime(reply.created_at)}</time
							>
						</a>
					{/each}
					{#if !allRepliesLoaded && remainingReplyCount > 0}
						<button type="button" class="live-more-replies" onclick={loadAllReplies}>
							💬 さらに表示する（残り{remainingReplyCount}件）
						</button>
					{/if}
				{:else if post.reply_count > 0}
					<p class="live-reply-status">返信を表示できませんでした</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if showDeleteModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="live-modal-overlay"
			role="presentation"
			onclick={(event) => {
				event.stopPropagation();
				if (event.target === event.currentTarget) showDeleteModal = false;
			}}
		>
			<div
				class="live-modal"
				use:trapFocus
				role="dialog"
				aria-modal="true"
				aria-labelledby="live-delete-title"
				tabindex="-1"
				onkeydown={(event) => {
					if (event.key === "Escape") showDeleteModal = false;
				}}
			>
				<h2 id="live-delete-title">投稿を削除</h2>
				<p>この投稿を削除します。この操作は取り消せません。</p>
				{#if deleteMessage}
					<p class="live-reply-status live-reply-error">{deleteMessage}</p>
				{/if}
				<div class="live-modal-actions">
					<button type="button" class="btn btn-ghost" onclick={() => (showDeleteModal = false)}>
						キャンセル
					</button>
					<button
						type="button"
						class="btn btn-danger"
						disabled={deleting}
						onclick={(event) => { event.stopPropagation(); deleteFormEl?.requestSubmit(); }}
					>
						削除する
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showReportModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="live-modal-overlay"
			role="presentation"
			onclick={(event) => {
				event.stopPropagation();
				if (event.target === event.currentTarget) showReportModal = false;
			}}
		>
			<div
				class="live-modal"
				use:trapFocus
				role="dialog"
				aria-modal="true"
				aria-labelledby="live-report-title"
				tabindex="-1"
				onkeydown={(event) => {
					if (event.key === "Escape") showReportModal = false;
				}}
			>
				<h2 id="live-report-title">投稿を通報</h2>
				<label>
					<span>理由</span>
					<select bind:value={reportReason}>
						<option value="spam">スパム</option>
						<option value="harassment">嫌がらせ</option>
						<option value="sexual">性的なコンテンツ</option>
						<option value="violence">暴力的なコンテンツ</option>
						<option value="illegal">違法・危険行為</option>
						<option value="other">その他</option>
					</select>
				</label>
				<label>
					<span>補足</span>
					<textarea rows="3" maxlength="500" bind:value={reportDetails}></textarea>
				</label>
				{#if reportMessage}
					<p class="live-reply-status">{reportMessage}</p>
				{/if}
				<div class="live-modal-actions">
					<button type="button" class="btn btn-ghost" onclick={() => (showReportModal = false)}>
						キャンセル
					</button>
					<button type="button" class="btn btn-primary" disabled={reportSubmitting} onclick={submitReport}>
						{reportSubmitting ? '送信中...' : '送信'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</article>

<style>
.live-post-card {
	--live-row-pad-x: 8px;
	--live-avatar-size: 20px;
	--live-grid-gap: 7px;
	--live-detail-start: calc(var(--live-row-pad-x) + var(--live-avatar-size) + var(--live-grid-gap));
	position: relative;
	border-bottom: 1px solid var(--color-border);
	border-left: 2px solid color-mix(in srgb, var(--color-border) 72%, transparent);
	background: transparent;
	transition: background 120ms ease;
	-webkit-tap-highlight-color: transparent;
}

.live-post-card:hover,
.live-post-card.expanded {
	background: color-mix(in srgb, var(--color-surface) 62%, transparent);
}

.live-post-card.deleting {
	opacity: 0.52;
	pointer-events: none;
}

.live-post-row {
	display: grid;
	grid-template-columns: var(--live-avatar-size) minmax(0, 1fr) max-content 52px;
	grid-template-areas:
		"avatar meta time action"
		". content content content";
	align-items: start;
	column-gap: var(--live-grid-gap);
	row-gap: 3px;
	min-height: 52px;
	padding: 6px var(--live-row-pad-x);
	cursor: pointer;
}

.live-post-row:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: -2px;
}

.live-avatar,
.live-name,
.live-username,
.live-link,
.live-reply {
	text-decoration: none;
}

.live-avatar {
	grid-area: avatar;
	align-self: center;
}

.live-meta {
	grid-area: meta;
	display: inline-flex;
	align-items: baseline;
	align-self: center;
	gap: 5px;
	min-width: 0;
}

.live-name {
	overflow: hidden;
	max-width: 112px;
	color: color-mix(in srgb, var(--color-text-muted) 76%, transparent);
	font-size: 12px;
	font-weight: 600;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.live-username {
	overflow: hidden;
	min-width: 0;
	color: color-mix(in srgb, var(--color-text-secondary) 70%, transparent);
	font-size: 11px;
	font-weight: 500;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.live-content {
	grid-area: content;
	display: -webkit-box;
	min-width: 0;
	margin: 0;
	overflow: hidden;
	color: var(--color-text);
	font-size: 13px;
	font-weight: 500;
	line-height: 1.35;
	word-break: break-word;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.live-post-card.expanded .live-content {
	display: block;
	-webkit-line-clamp: unset;
	line-clamp: unset;
}

.live-link {
	color: var(--color-accent);
}

.live-time {
	grid-area: time;
	display: inline-flex;
	align-items: center;
	align-self: center;
	min-width: 0;
	color: var(--color-text-muted);
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.live-time :global(.broadcast-ts-badge) {
	padding: 1px 5px;
	font-size: 10px;
	line-height: 1.2;
}

.live-time :global(.broadcast-ts-abs) {
	font-size: 10px;
}

.live-time-abs {
	margin-left: 4px;
	font-size: 10px;
}

.live-like-form {
	grid-area: action;
	display: inline-flex;
	align-self: center;
	justify-content: flex-end;
}

.live-like,
.live-collapse {
	grid-area: action;
	align-self: center;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 3px;
	width: 52px;
	min-height: 24px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
	line-height: 1;
	cursor: pointer;
}

.live-like:hover,
.live-like.active,
.live-action-like:hover,
.live-action-like.active {
	color: #f43f5e;
}

.live-like svg,
.live-collapse svg {
	flex-shrink: 0;
}

.live-collapse {
	color: var(--color-text-secondary);
}

.live-collapse svg {
	transform: translateX(-5px);
}

.live-detail {
	padding: 2px var(--live-row-pad-x) 8px var(--live-detail-start);
	cursor: default;
}

.live-actions {
	display: flex;
	align-items: center;
	gap: 3px;
	margin-top: 5px;
}

.live-actions > .live-action:first-child {
	margin-left: -7px;
}

.live-actions form {
	display: inline-flex;
}

.live-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	min-width: 30px;
	height: 28px;
	padding: 0 7px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--color-text-muted);
	font-size: 12px;
	line-height: 1;
	text-decoration: none;
	cursor: pointer;
}

.live-action:hover {
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	color: var(--color-text);
}

.live-action.active {
	color: var(--color-text-muted);
}

.live-action-reply:hover {
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	color: var(--color-accent);
	text-decoration: none;
}

.live-action-repost:not(:disabled):hover {
	background: rgba(34, 197, 94, 0.1);
	color: #22c55e;
}

.live-action-repost.active {
	color: #22c55e;
}

.live-action-like:not(:disabled):hover {
	background: rgba(244, 63, 94, 0.1);
	color: #f43f5e;
}

.live-action-like:hover,
.live-action-like.active {
	color: #f43f5e;
}

.live-action-bookmark.active {
	color: var(--color-text-muted);
}

.live-action:disabled,
.live-like:disabled {
	cursor: default;
	opacity: 0.5;
}

.live-action svg,
.live-action [class^="i-lucide"] {
	width: 15px;
	height: 15px;
	flex-shrink: 0;
}

.live-menu-wrap {
	position: relative;
}

.live-menu {
	position: absolute;
	top: calc(100% + 4px);
	right: 0;
	z-index: 20;
	min-width: 96px;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg-card);
	box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
}

.live-menu-item {
	width: 100%;
	padding: 8px 10px;
	border: none;
	background: transparent;
	color: var(--color-text);
	font: inherit;
	font-size: 13px;
	text-align: left;
	cursor: pointer;
}

.live-menu-item:hover {
	background: var(--color-bg-hover);
}

.live-menu-item.danger {
	color: var(--color-danger);
}

.live-replies {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin-top: 6px;
	padding-left: 10px;
	border-left: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
}

.live-reply {
	display: grid;
	grid-template-columns: 20px max-content minmax(0, 1fr) max-content;
	align-items: center;
	gap: 6px;
	min-height: 26px;
	padding: 3px 0;
	color: var(--color-text-secondary);
}

.live-reply-name {
	max-width: 96px;
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 11px;
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.live-reply-text {
	overflow: hidden;
	color: var(--color-text-secondary);
	font-size: 12px;
	line-height: 1.25;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.live-reply:hover .live-reply-text {
	color: var(--color-text);
}

.live-reply-time {
	color: var(--color-text-muted);
	font-size: 10px;
	white-space: nowrap;
}

.live-reply-status,
.live-more-replies {
	margin: 4px 0 0;
	color: var(--color-text-muted);
	font-size: 12px;
}

.live-reply-error {
	color: var(--color-danger);
}

.live-more-replies {
	align-self: flex-start;
	padding: 4px 6px;
	border: none;
	border-radius: 6px;
	background: transparent;
	cursor: pointer;
}

.live-more-replies:hover {
	background: var(--color-bg-hover);
	color: var(--color-text);
}

.live-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgba(0, 0, 0, 0.58);
}

.live-modal {
	display: flex;
	width: min(380px, 100%);
	flex-direction: column;
	gap: 10px;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-bg-card);
	padding: 16px;
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.live-modal h2,
.live-modal p {
	margin: 0;
}

.live-modal h2 {
	font-size: 15px;
}

.live-modal p,
.live-modal label {
	color: var(--color-text-secondary);
	font-size: 13px;
}

.live-modal label {
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.live-modal select,
.live-modal textarea {
	width: 100%;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	font: inherit;
}

.live-modal select {
	padding: 7px 9px;
}

.live-modal textarea {
	padding: 8px 9px;
	resize: vertical;
}

.live-modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 640px) {
	.live-post-card {
		--live-row-pad-x: 6px;
		--live-grid-gap: 5px;
	}

	.live-post-row {
		grid-template-columns: 20px minmax(0, 1fr) max-content 48px;
		min-height: 50px;
	}

	.live-name {
		max-width: 82px;
	}

	.live-username {
		max-width: 72px;
	}

	.live-content {
		font-size: 12px;
	}

	.live-time {
		font-size: 10px;
	}

	.live-like,
	.live-collapse {
		width: 48px;
		font-size: 11px;
	}
}
</style>
