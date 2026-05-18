<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<div class="bookmarks-page">
	<header class="page-header">
		<h1 class="page-title">ブックマーク</h1>
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
</div>

<style>
.bookmarks-page {
	max-width: 600px;
	margin: 0 auto;
	padding: 0 1rem;
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
