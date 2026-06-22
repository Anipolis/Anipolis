<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import PostCard from "$lib/components/PostCard.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

function handleBackClick(event: MouseEvent) {
	event.preventDefault();

	if (browser && window.history.length > 1) {
		window.history.back();
		return;
	}

	void goto("/");
}
</script>

<svelte:head> <title>#{data.tag} — Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<div class="hashtag-header">
			<a href="/" class="hashtag-back-link" aria-label="前の画面に戻る" onclick={handleBackClick}>
				<span class="i-lucide-arrow-left" aria-hidden="true"></span>
				<span>戻る</span>
			</a>
			<div>
				<h1>#{data.tag}</h1>
				<p>{data.posts.length}件の投稿</p>
			</div>
		</div>

		{#await data.posts}
			<div class="posts-loading-spinner" aria-label="投稿を読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: 5 } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:then posts}
			{#if posts.length === 0}
				<div class="empty-state">
					<p>#{data.tag} の投稿はまだありません</p>
				</div>
			{:else}
				{#each posts as post (post.id)}
					<PostCard {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/await}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>
