<script lang="ts">
import { page } from "$app/state";
import PostRow from "$lib/components/PostRow.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { timelineCursorHref } from "$lib/timeline-cursor";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head><title>ブックマーク - Anipolis</title></svelte:head>

<div class="page-container">
	<main class="feed-column bookmarks-page">
		<header class="bookmarks-header">
			<h1>ブックマーク</h1>
		</header>

		{#if data.posts.length === 0 && !data.nextCursor}
			<p class="empty">保存した投稿はまだありません</p>
		{:else}
			<div class="post-list">
				{#each data.posts as post (post.id)}
					<PostRow {post} currentUserId={data.userId} />
				{/each}
			</div>
			{#if data.nextCursor}
				<a href={timelineCursorHref(page.url, data.nextCursor)} class="load-more-btn">さらに読み込む</a>
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
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

.bookmarks-page {
	padding: 0;
}

.empty {
	padding: 48px 16px;
	text-align: center;
	color: var(--color-text-muted);
}

.post-list {
	display: flex;
	flex-direction: column;
}
</style>
