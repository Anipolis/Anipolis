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

		<div class="mobile-search-trending">
			<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
		</div>

		{#if !data.query}
			<div class="empty-state">
				<p>キーワードを入力して検索してください</p>
			</div>
		{:else}
			<h2 class="search-result-title">「{data.query}」の検索結果</h2>

			{#if data.animeMatches.items.length > 0}
				<!-- 検索語に一致した作品。投稿検索ではこれらの作品の引用投稿も拾っている -->
				<div class="search-section">
					<h3>作品</h3>
					<div class="anime-match-list">
						{#each data.animeMatches.items as anime (anime.id)}
							<a href="/anime/{anime.id}" class="anime-match-card">
								{#if anime.cover_url}
									<img src={anime.cover_url} alt="" loading="lazy" class="anime-match-cover">
								{:else}
									<div class="anime-match-cover anime-match-cover--empty" aria-hidden="true"></div>
								{/if}
								<div class="anime-match-info">
									<div class="anime-match-title">{anime.title}</div>
									{#if anime.title_en}
										<div class="anime-match-sub">{anime.title_en}</div>
									{/if}
								</div>
							</a>
						{/each}
					</div>
					{#if data.animeMatches.tooMany || data.animeMatches.total > data.animeMatches.items.length}
						<a href="/anime?search={encodeURIComponent(data.query)}" class="anime-match-more">
							{data.animeMatches.tooMany ? "アニメ一覧で続きを見る" : `アニメ一覧で全${data.animeMatches.total}件を見る`}
						</a>
					{/if}
					{#if data.animeMatches.tooMany}
						<p class="anime-match-note">
							一致する作品が多いため、投稿は本文のみで検索しました。作品名を詳しく入力すると、その作品の引用投稿も検索できます。
						</p>
					{/if}
				</div>
			{/if}

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
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.anime-match-list {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
	gap: 8px;
}

.anime-match-card {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 10px 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	color: inherit;
	text-decoration: none;
	transition: border-color 0.15s;
}

.anime-match-card:hover {
	border-color: var(--color-border-hover);
	text-decoration: none;
}

.anime-match-cover {
	flex-shrink: 0;
	width: 40px;
	height: 56px;
	border-radius: 4px;
	object-fit: cover;
	background: var(--color-border);
}

.anime-match-info {
	min-width: 0;
}

.anime-match-title {
	font-size: 14px;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.anime-match-sub {
	margin-top: 2px;
	font-size: 12px;
	color: var(--color-text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.anime-match-more {
	display: inline-block;
	margin-top: 10px;
	font-size: 13px;
}

.anime-match-note {
	margin-top: 8px;
	font-size: 12px;
	color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
	.anime-match-card {
		transition: none;
	}
}

.mobile-search-trending {
	display: none;
}

@media (max-width: 768px) {
	.mobile-search-trending {
		display: block;
		margin-bottom: 24px;
	}
}
</style>
