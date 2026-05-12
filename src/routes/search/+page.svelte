<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>{data.query ? `「${data.query}」の検索結果` : '検索'} - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		<h1 class="section-title">検索</h1>

		<form method="GET" action="/search" class="global-search-form">
			<div class="global-search-input-wrap">
				<svg
					class="global-search-icon"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.35-4.35" />
				</svg>
				<input
					type="search"
					name="q"
					class="global-search-input"
					placeholder="投稿やユーザーを検索"
					value={data.query}
					aria-label="検索"
				>
			</div>
			<button type="submit" class="global-search-button">検索</button>
		</form>

		{#if !data.query}
			<div class="empty-state">
				<p>キーワードを入力して検索してください</p>
			</div>
		{:else}
			<h2 class="search-result-title">「{data.query}」の検索結果</h2>

			{#if data.users.length > 0}
				<div class="search-section">
					<h3>ユーザー</h3>
					{#each data.users as user}
						<a href="/profile/{user.username}" class="user-card">
							<UserAvatar src={user.avatar_url} username={user.username} size="md" />
							<div class="user-card-info">
								<div class="user-card-name">{user.display_name ?? user.username}</div>
								<div class="user-card-username">@{user.username}</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}

			<div class="search-section">
				<h3>投稿</h3>
				{#if data.posts.length === 0}
					<div class="empty-state">
						<p>「{data.query}」の投稿は見つかりませんでした</p>
					</div>
				{:else}
					{#each data.posts as post (post.id)}
						<PostCard {post} currentUserId={data.user?.id ?? null} />
					{/each}
				{/if}
			</div>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={[]} />
	</aside>
</div>
