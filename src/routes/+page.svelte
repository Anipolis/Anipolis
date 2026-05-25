<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostComposer from "$lib/components/PostComposer.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

/** スケルトンの枚数（タイムラインの典型的な表示密度に合わせた仮枠） */
const SKELETON_COUNT = 5;

let { data }: PageProps = $props();
</script>

<svelte:head> <title>Anipolis — タイムライン</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		{#if data.profile}
			<PostComposer
				username={data.profile.username}
				avatarUrl={data.profile.avatar_url}
				initialAnime={data.initialAnime}
				initialContent={data.initialContent}
				initialExchangeId={data.initialExchangeId}
				initialExchangeShare={data.initialExchangeShare}
			/>
		{:else if data.session}
			<div class="auth-gate">
				<p>ようこそ！<a href="/settings">設定</a>を確認してから投稿できます。</p>
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

		<!--
			data.posts は deferred Promise。
			- 待機中: スピナー + スケルトンカードを表示してレイアウトシフトを最小化
			- 解決後: 実際の投稿カードに差し替え
			- エラー時: 再読み込みを促すメッセージ
		-->
		{#await data.posts}
			<div class="posts-loading-spinner" aria-label="投稿を読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: SKELETON_COUNT } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:then posts}
			{#if posts.length === 0}
				<div class="empty-state">
					{#if data.tab === 'following'}
						<p>フォロー中のユーザーの投稿がありません。<br>気になるユーザーをフォローしてみましょう！</p>
					{:else}
						<p>まだ投稿がありません。最初の投稿をしてみましょう！</p>
					{/if}
				</div>
			{:else}
				{#each posts as post (post.id)}
					<PostCard {post} currentUserId={data.user?.id ?? null} />
				{/each}
			{/if}
		{/await}
	</main>

	<aside class="sidebar-column"><TrendingPanel trending={data.trending} /></aside>
</div>
