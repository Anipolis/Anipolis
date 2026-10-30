<script lang="ts">
import { contentWarningLabel, hasContentWarning } from "$lib/content-warning";
import { fetchRoomPostPages, mergeReplies, type RoomPostCursor, type RoomPostPage } from "$lib/room-live-sync";
import type { Post } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import PostRow from "./PostRow.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	broadcastStartAt?: string | null;
	timelineTimeMode?: boolean;
	joinPrevious?: boolean;
	joinNext?: boolean;
}
let {
	post,
	currentUserId = null,
	broadcastStartAt = null,
	timelineTimeMode = false,
	joinPrevious = false,
	joinNext = false,
}: Props = $props();
let expanded = $state(false);
let replies = $state<Post[]>([]);
let repliesLoaded = $state(false);
let repliesLoading = $state(false);
let repliesError = $state("");
// 「さらに表示する」で古い順に取ってきた境界（#325）。続きはここから取る
let replyCursor: RoomPostCursor | null = null;
// 続きが無いところまで取り切ったときの返信数。これより増えたら（新しい返信が付いたら）また取れる
let exhaustedAtReplyCount = $state<number | null>(null);
// 最後に返信を取り込んだ時点の返信数。展開中にこれより増えたら、新しい返信を取り足す（#324）
let syncedReplyCount = $state(0);
// 新しい返信の取り足し中。一覧は出したまま裏で取るので、repliesLoading とは分ける
let refreshingReplies = false;
const remainingReplyCount = $derived(Math.max(post.reply_count - replies.length, 0));
// ミュート等で除外された返信があると件数が合わないので、取り切った後は返信数が増えたときだけ出す
const canLoadMoreReplies = $derived(
	remainingReplyCount > 0 && (exhaustedAtReplyCount === null || post.reply_count > exhaustedAtReplyCount),
);
/** 1回の「さらに表示する」で続けて取る最大ページ数（1ページ100件） */
const MAX_REPLY_PAGES = 10;

function stop(event: Event) {
	event.stopPropagation();
}
async function toggleExpanded() {
	expanded = !expanded;
	if (expanded) await loadRecentReplies();
}
async function loadRecentReplies() {
	if (repliesLoaded || post.reply_count <= 0 || repliesLoading) return;
	repliesLoading = true;
	repliesError = "";
	const countAtRequest = post.reply_count;
	try {
		const params = new URLSearchParams({ mode: "recent", limit: "3" });
		const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies?${params}`);
		const body = (await response.json().catch(() => ({}))) as { replies?: Post[]; message?: string };
		if (!response.ok) {
			repliesError = body.message ?? "返信を読み込めませんでした";
			return;
		}
		replies = mergeReplies(replies, body.replies ?? []);
		repliesLoaded = true;
		syncedReplyCount = countAtRequest;
	} catch {
		repliesError = "返信を読み込めませんでした";
	} finally {
		repliesLoading = false;
	}
}

/**
 * 取り込んだ後に付いた返信を取り足す（#324）。新しい返信は最新側に付くので、増えた件数ぶんの
 * 最新の返信を取り、取得済みの一覧と ID でまとめる（「さらに表示する」の境界には影響しない）。
 * 100件を超えて増えた分は「さらに表示する」で取れる。
 */
async function loadNewReplies() {
	const added = post.reply_count - syncedReplyCount;
	if (refreshingReplies || added <= 0) return;
	refreshingReplies = true;
	const countAtRequest = post.reply_count;
	try {
		const params = new URLSearchParams({ mode: "recent", limit: String(Math.min(added, 100)) });
		const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies?${params}`);
		if (!response.ok) return;
		const body = (await response.json().catch(() => ({}))) as { replies?: Post[] };
		replies = mergeReplies(replies, body.replies ?? []);
		syncedReplyCount = countAtRequest;
	} catch {
		// 次に返信数が変わったとき、または「さらに表示する」で取り直せる
	} finally {
		refreshingReplies = false;
	}
}

// 展開中に返信が付いたら（ルームの再確認で返信数が増えたら）読み込む（#324）。
// 未取得なら最新の返信を、取得済みなら増えた分だけを取り足す
$effect(() => {
	if (!expanded || repliesLoading || repliesError || post.reply_count <= 0) return;
	if (!repliesLoaded) {
		void loadRecentReplies();
		return;
	}
	if (post.reply_count > syncedReplyCount) void loadNewReplies();
});

/** 返信を古い順に1ページ取る。失敗したら null（メッセージは repliesError に入れる） */
async function fetchReplyPage(cursor: RoomPostCursor | null): Promise<RoomPostPage | null> {
	const params = new URLSearchParams({ mode: "all", limit: "100" });
	if (cursor) {
		params.set("after_created_at", cursor.createdAt);
		params.set("after_id", cursor.id);
	}
	try {
		const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies?${params}`);
		const body = (await response.json().catch(() => ({}))) as {
			replies?: Post[];
			nextCursor?: RoomPostCursor | null;
			hasMore?: boolean;
			message?: string;
		};
		if (!response.ok) {
			repliesError = body.message ?? "返信を読み込めませんでした";
			return null;
		}
		return { posts: body.replies ?? [], nextCursor: body.nextCursor ?? null, hasMore: Boolean(body.hasMore) };
	} catch {
		repliesError = "返信を読み込めませんでした";
		return null;
	}
}

/**
 * 「さらに表示する」: 取得済みの境界から続きを古い順に取り、取得済みの返信と ID でまとめる（#325）。
 * 以前は古い100件で打ち切って全件取得済み扱いにしていたため、101件目以降へ進めなかった。
 */
async function loadMoreReplies(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	if (repliesLoading) return;
	repliesLoading = true;
	repliesError = "";
	const countAtRequest = post.reply_count;
	try {
		const result = await fetchRoomPostPages(fetchReplyPage, replyCursor, MAX_REPLY_PAGES);
		replyCursor = result.cursor;
		replies = mergeReplies(replies, result.posts);
		repliesLoaded = true;
		if (result.ok) syncedReplyCount = Math.max(syncedReplyCount, countAtRequest);
		if (result.ok && !result.hasMore) exhaustedAtReplyCount = post.reply_count;
	} finally {
		repliesLoading = false;
	}
}
</script>
<PostRow
	{post}
	{currentUserId}
	{joinPrevious}
	{joinNext}
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
					<!-- 返信一覧は本文を1行で出すので、CW 付きは本文の代わりに警告を出す（#319） -->
					<span class="live-reply-text"
						>{hasContentWarning(reply) ? contentWarningLabel(reply) : reply.content}</span
					>
					<time class="live-reply-time" datetime={reply.created_at}
						>{formatRelativeTime(reply.created_at)}</time
					>
				</a>
			{/each}
			{#if canLoadMoreReplies}
				<button type="button" class="live-more-replies" onclick={loadMoreReplies}>
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
