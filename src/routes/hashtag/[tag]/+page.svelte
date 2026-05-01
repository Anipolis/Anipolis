<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>#{data.tag} - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<div class="hashtag-header">
			<h1>#{data.tag}</h1>
			<p>{data.posts.length}件の投稿</p>
		</div>

		{#if data.posts.length === 0}
			<div class="empty-state">
				<p>#{data.tag} の投稿はまだありません</p>
			</div>
		{:else}
			{#each data.posts as post (post.id)}
				<PostCard {post} currentUserId={data.user?.id ?? null} />
			{/each}
		{/if}
	</main>

	<aside class="sidebar-column"><TrendingPanel trending={data.trending} /></aside>
</div>
