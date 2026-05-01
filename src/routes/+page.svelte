<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>タイムライン - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		{#if data.profile}
			<PostComposer username={data.profile.username} avatarUrl={data.profile.avatar_url} />
		{:else if data.session}
			<div class="auth-gate">
				<p>ようこそ！<a href="/settings/profile">プロフィールを設定</a>してから投稿できます。</p>
			</div>
		{:else}
			<div class="auth-gate">
				<p>投稿するにはログインが必要です</p>
			</div>
		{/if}

		{#if data.user}
			<div class="timeline-tabs">
				<a href="/" class="timeline-tab" class:active={data.tab === 'all'}> 全体 </a>
				<a href="/?tab=following" class="timeline-tab" class:active={data.tab === 'following'}> フォロー中 </a>
			</div>
		{/if}

		{#if data.posts.length === 0}
			<div class="empty-state">
				{#if data.tab === 'following'}
					<p>フォロー中のユーザーの投稿がありません。<br>気になるユーザーをフォローしてみましょう！</p>
				{:else}
					<p>まだ投稿がありません。最初の投稿をしてみましょう！</p>
				{/if}
			</div>
		{:else}
			{#each data.posts as post (post.id)}
				<PostCard {post} currentUserId={data.user?.id ?? null} />
			{/each}
		{/if}
	</main>

	<aside class="sidebar-column"><TrendingPanel trending={data.trending} /></aside>
</div>
