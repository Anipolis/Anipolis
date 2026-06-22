<script lang="ts">
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { formatRelativeTime } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const displayName = $derived(data.author.display_name || data.author.username);
const relativeTime = $derived(formatRelativeTime(data.createdAt));
</script>

<svelte:head> <title>交換結果 - Anipolis</title> </svelte:head>

<div class="page-container">
	<main class="feed-column exchange-result-page">
		<div class="exchange-result-shell">
			<header class="exchange-result-header">
				<a href="/profile/{data.author.username}" class="exchange-result-author">
					<UserAvatar src={data.author.avatar_url} username={data.author.username} size="md" />
					<span>
						<strong>{displayName}</strong>
						<small>@{data.author.username} · {relativeTime}</small>
					</span>
				</a>
				<a href="/posts/{data.postId}" class="exchange-result-post-link">投稿を見る</a>
			</header>

			<section class="exchange-result-main">
				<div class="exchange-result-title">
					<span>匿名アニメトレード</span>
					<h1>交換完了</h1>
				</div>

				<AnimeExchangeResult
					offeredAnime={data.exchangeShare.offered_anime}
					receivedAnime={data.exchangeShare.received_anime}
					offeredComment={data.exchangeShare.offered_comment}
					receivedComment={data.exchangeShare.received_comment}
				/>

				<div class="exchange-result-actions">
					<a
						href="/anime/{data.exchangeShare.offered_anime.id}"
						class="exchange-result-button exchange-result-button--ghost"
					>
						贈ったアニメを見る
					</a>
					<a href="/anime/{data.exchangeShare.received_anime.id}" class="exchange-result-button">
						受け取ったアニメを見る
					</a>
					<a href="/exchange" class="exchange-result-button exchange-result-button--ghost"> 交換してみる </a>
				</div>
			</section>
		</div>
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.exchange-result-page {
	padding: 0;
}

.exchange-result-shell {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.exchange-result-header,
.exchange-result-main {
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}

.exchange-result-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
}

.exchange-result-author {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	color: var(--color-text);
	text-decoration: none;
}

.exchange-result-author span {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.exchange-result-author strong,
.exchange-result-author small {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.exchange-result-author small,
.exchange-result-post-link,
.exchange-result-title span {
	color: var(--color-text-muted);
	font-size: 0.82rem;
}

.exchange-result-post-link {
	flex: 0 0 auto;
	font-weight: 800;
}

.exchange-result-main {
	padding: 22px;
	display: flex;
	flex-direction: column;
	gap: 18px;
}

.exchange-result-title {
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.exchange-result-title span {
	color: var(--color-accent);
	font-weight: 900;
}

.exchange-result-title h1 {
	margin: 0;
	color: var(--color-text);
	font-size: 1.7rem;
}

.exchange-result-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.exchange-result-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 42px;
	padding: 0 16px;
	border-radius: 8px;
	background: var(--color-accent);
	color: #fff;
	font-weight: 800;
	text-decoration: none;
}

.exchange-result-button--ghost {
	background: transparent;
	color: var(--color-accent);
	border: 1px solid var(--color-accent);
}

@media (max-width: 640px) {
	.exchange-result-header {
		align-items: flex-start;
		flex-direction: column;
	}

	.exchange-result-main {
		padding: 16px;
	}

	.exchange-result-button {
		width: 100%;
	}
}
</style>
