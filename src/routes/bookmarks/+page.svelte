<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<div class="page-container">
	<main class="feed-column bookmarks-page">
		<header class="bookmarks-header">
			<h1>ブックマーク</h1>
		</header>

		{#if data.posts.length === 0}
			<p class="empty">保存した投稿はまだありません</p>
		{:else}
			<div class="post-list">
				{#each data.posts as post (post.id)}
					<PostCard {post} currentUserId={data.userId} />
				{/each}
			</div>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} />
	</aside>
</div>

<style>
.bookmarks-page {
	padding: 0;
}

.bookmarks-header {
	padding: 1rem 0;
	border-bottom: 1px solid var(--border);
}

.bookmarks-header h1 {
	font-size: 1.25rem;
	font-weight: 700;
	margin: 0;
}

.empty {
	padding: 3rem 1rem;
	text-align: center;
	color: var(--text-muted);
}

.post-list {
	display: flex;
	flex-direction: column;
}
</style>
