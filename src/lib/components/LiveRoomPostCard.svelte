<script lang="ts">
import type { Post } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import PostRow from "./PostRow.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	broadcastStartAt?: string | null;
	timelineTimeMode?: boolean;
	continuation?: boolean;
}
let {
	post,
	currentUserId = null,
	broadcastStartAt = null,
	timelineTimeMode = false,
	continuation = false,
}: Props = $props();
let expanded = $state(false);
let replies = $state<Post[]>([]);
let repliesLoaded = $state(false);
let allRepliesLoaded = $state(false);
let repliesLoading = $state(false);
let repliesError = $state("");
const remainingReplyCount = $derived(Math.max(post.reply_count - replies.length, 0));
function stop(event: Event) {
	event.stopPropagation();
}
async function toggleExpanded() {
	expanded = !expanded;
	if (expanded) await loadRecentReplies();
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
</script>
<PostRow
	{post}
	{currentUserId}
	{continuation}
	insideRoom
	broadcastStartAt={timelineTimeMode ? null : broadcastStartAt}
	{expanded}
	onExpand={toggleExpanded}
>
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
</PostRow>
<style>
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
</style>
