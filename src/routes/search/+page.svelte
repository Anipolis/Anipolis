<script lang="ts">
import PostCard from "$lib/components/PostCard.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<svelte:head> <title>{data.query ? `「${data.query}」の検索結果` : '検索'} — Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column">
		{#if !data.query}
			<div class="empty-state">
				<p>キーワードを入力して検索してください</p>
			</div>
		{:else}
			<h1 class="section-title">「{data.query}」の検索結果</h1>

			{#if data.users.length > 0}
				<div class="search-section">
					<h2>ユーザー</h2>
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
				<h2>投稿</h2>
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

	<aside class="sidebar-column"><TrendingPanel trending={[]} /></aside>
</div>
