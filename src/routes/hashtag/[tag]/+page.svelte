<script lang="ts">
import BackLink from "$lib/components/BackLink.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { createLatestResolved } from "$lib/latest-resolved.svelte";
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
				<p>{data.posts.length}件の投稿</p>
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
			{#if posts.length === 0}
				<div class="empty-state">
					<p>#{data.tag} の投稿はまだありません</p>
				</div>
			{:else}
				{#each posts as post (post.id)}
					<PostRow {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>
