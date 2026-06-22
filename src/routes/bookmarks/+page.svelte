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
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
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
