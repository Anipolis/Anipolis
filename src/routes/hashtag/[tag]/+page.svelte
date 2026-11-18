<script lang="ts">
import BackLink from "#lib/components/BackLink.svelte";
import PostCardSkeleton from "#lib/components/PostCardSkeleton.svelte";
import PostRow from "#lib/components/PostRow.svelte";
import TrendingPanel from "#lib/components/TrendingPanel.svelte";
import { createLatestResolved } from "#lib/latest-resolved.svelte.ts";
import { timelineCursorHref } from "#lib/timeline-cursor.ts";
import { page } from "$app/state";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

// 再取得中も前回の一覧を保持する（スケルトンは初回だけ、#100）。別のタグに移ったら保持しない
const timeline = createLatestResolved(
	() => data.posts,
	() => data.tag,
);
</script>

<svelte:head> <title>#{data.tag} - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<div class="hashtag-header">
			<BackLink fallbackHref="/" class="hashtag-back-link" />
			<div>
				<h1>#{data.tag}</h1>
			</div>
		</div>

		{#if timeline.value === null}
			<div class="posts-loading-spinner" role="status" aria-label="投稿を読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: 5 } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:else}
			{@const posts = timeline.value}
			{#if data.postsFailed}
				<div class="empty-state" role="alert">
					<p>投稿を読み込めませんでした。時間をおいて開き直してください</p>
				</div>
			{:else if posts.length === 0 && !data.nextCursor}
				<div class="empty-state">
					<p>
						{data.isContinuation ? "これより前の投稿はありません" : `#${data.tag} の投稿はまだありません`}
					</p>
				</div>
			{:else}
				{#each posts as post (post.id)}
					<PostRow {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
			{#if !data.postsFailed && data.nextCursor}
				<a href={timelineCursorHref(page.url, data.nextCursor)} class="load-more-btn">さらに読み込む</a>
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
/* プロフィールの一覧の「さらに読み込む」と同じ見た目 */
.load-more-btn {
	display: block;
	padding: 14px 16px;
	text-align: center;
	font-size: 0.9rem;
	font-weight: 500;
	color: var(--color-accent);
	text-decoration: none;
	border-top: 1px solid var(--color-border);
	transition: background 0.12s;
}

.load-more-btn:hover {
	background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}
</style>
