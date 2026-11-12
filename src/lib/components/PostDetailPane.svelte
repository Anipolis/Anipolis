<script lang="ts">
import type { Post } from "$lib/types";
import PostCardSkeleton from "./PostCardSkeleton.svelte";
import PostDetail from "./PostDetail.svelte";
import PostRow from "./PostRow.svelte";
import ReplyComposer from "./ReplyComposer.svelte";

/**
 * タイムラインなどの上に重ねて出す投稿詳細（浅いルーティング）。
 * 本文は呼び出し元がすでに持っている投稿をそのまま使い、読み直さない。
 * 取りに行くのは、持っていない返信だけ。
 */
interface Props {
	post: Post;
	currentUserId: string | null;
	profile: { avatar_url: string | null; display_name: string | null; username: string } | null | undefined;
	hasSession: boolean;
	onback: () => void;
}

let { post, currentUserId, profile, hasSession, onback }: Props = $props();

type Cursor = { createdAt: string; id: string };
type RepliesPage = { replies: Post[]; nextCursor: Cursor | null; hasMore: boolean };

let replies = $state<Post[]>([]);
let nextCursor = $state<Cursor | null>(null);
let loading = $state(true);
let loadingMore = $state(false);
let failed = $state(false);

async function fetchReplies(postId: string, after: Cursor | null, signal?: AbortSignal): Promise<RepliesPage> {
	const params = new URLSearchParams({ mode: "all", limit: "100" });
	if (after) {
		params.set("after_created_at", after.createdAt);
		params.set("after_id", after.id);
	}
	const response = await fetch(
		`/api/posts/${encodeURIComponent(postId)}/replies?${params}`,
		signal ? { signal } : {},
	);
	if (!response.ok) throw new Error(`replies ${response.status}`);
	const body = (await response.json()) as Partial<RepliesPage>;
	return {
		replies: body.replies ?? [],
		nextCursor: body.hasMore ? (body.nextCursor ?? null) : null,
		hasMore: Boolean(body.hasMore),
	};
}

/** 先頭から取り直す。最初の表示と、返信を送ったあとに使う */
async function reload(signal?: AbortSignal) {
	failed = false;
	try {
		const page = await fetchReplies(post.id, null, signal);
		if (signal?.aborted) return;
		replies = page.replies;
		nextCursor = page.nextCursor;
	} catch (error) {
		if (signal?.aborted) return;
		console.error("[post-detail-pane] replies failed:", error);
		// 取り直しの失敗では、すでに出ている返信を消さない
		failed = replies.length === 0;
	} finally {
		if (!signal?.aborted) loading = false;
	}
}

async function loadMore() {
	if (!nextCursor || loadingMore) return;
	loadingMore = true;
	try {
		const page = await fetchReplies(post.id, nextCursor);
		const known = new Set(replies.map((reply) => reply.id));
		replies = [...replies, ...page.replies.filter((reply) => !known.has(reply.id))];
		nextCursor = page.nextCursor;
	} catch (error) {
		console.error("[post-detail-pane] more replies failed:", error);
	} finally {
		loadingMore = false;
	}
}

$effect(() => {
	void post.id;
	const controller = new AbortController();
	loading = true;
	replies = [];
	nextCursor = null;
	void reload(controller.signal);
	return () => controller.abort();
});

const title = $derived(`${post.display_name || post.username}の投稿 - Anipolis`);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="post-pane">
	<button type="button" class="post-detail-back" aria-label="タイムラインに戻る" onclick={onback}>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m15 18-6-6 6-6" />
		</svg>
	</button>

	<div class="thread-main">
		<PostDetail {post} {currentUserId} />
	</div>

	<ReplyComposer
		action={`/posts/${post.id}?/reply`}
		replyTo={post.username}
		{profile}
		{hasSession}
		loginNext={`/posts/${post.id}`}
		onsettled={() => reload()}
	/>

	{#if failed}
		<div class="empty-state" role="alert">
			<p>返信を読み込めませんでした</p>
			<button type="button" class="btn" onclick={() => reload()}>もう一度読み込む</button>
		</div>
	{:else if loading}
		<div class="posts-loading-spinner" role="status" aria-label="返信を読み込み中">
			<div class="spinner" aria-hidden="true"></div>
			<span>読み込み中…</span>
		</div>
		<PostCardSkeleton />
	{:else if replies.length > 0}
		<div class="replies-section">
			{#each replies as reply (reply.id)}
				<PostRow post={reply} {currentUserId} />
			{/each}
		</div>
		{#if nextCursor}
			<button type="button" class="load-more-btn" disabled={loadingMore} onclick={loadMore}>
				{loadingMore ? "読み込み中…" : "さらに読み込む"}
			</button>
		{/if}
	{:else}
		<div class="empty-state" style="margin-top: 8px;">
			<p>まだ返信がありません</p>
		</div>
	{/if}
</div>
