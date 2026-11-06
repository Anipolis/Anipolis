<script lang="ts">
import { page } from "$app/state";
import { ANIME_STATUS_ICONS, ANIME_STATUS_LABELS } from "$lib/anime-status";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

const collection = $derived(data.collection);
const ownerName = $derived(collection.owner.display_name || collection.owner.username);
const updatedLabel = $derived(
	new Date(collection.updated_at).toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "Asia/Tokyo",
	}),
);

// 「リンクをコピー」は今は動いていないので隠しておく（直したら true に戻す）
const SHOW_COPY_LINK = false;
let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyLink() {
	try {
		await navigator.clipboard.writeText(page.url.href);
		copied = true;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 2000);
	} catch {
		window.prompt("このリンクをコピーしてください", page.url.href);
	}
}
</script>

<svelte:head>
	<title>{collection.title}（{ownerName}のコレクション） - Anipolis</title>
	<meta property="og:title" content="{collection.title}（{ownerName}のコレクション）">
	<meta
		property="og:description"
		content={collection.description ?? `${ownerName}さんのコレクション・${collection.items.length}作品`}
	>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if collection.items[0]?.cover_url}
		<meta property="og:image" content={collection.items[0].cover_url}>
	{/if}
	{#if !collection.is_public}
		<meta name="robots" content="noindex">
	{/if}
</svelte:head>

<div class="page-container">
	<main class="feed-column collection-page">
		<header class="collection-header">
			{#if data.isOwn}
				<a href="/collections" class="collection-back">
					<span class="i-lucide-arrow-left" aria-hidden="true"></span>
					コレクション一覧
				</a>
			{/if}
			<a href={data.isOwn ? '/collections' : `/profile/${collection.owner.username}`} class="collection-owner">
				<UserAvatar src={collection.owner.avatar_url} username={ownerName} size="xs" />
				<span>{ownerName}のコレクション</span>
			</a>
			<h1 class="collection-title">
				{collection.title}
				{#if !collection.is_public}
					<span class="collection-private-badge">
						<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
						非公開
					</span>
				{/if}
			</h1>
			{#if collection.description}
				<p class="collection-description">{collection.description}</p>
			{/if}
			<p class="collection-meta">{collection.items.length}作品・{updatedLabel}更新</p>

			<!-- 作品の出し入れは作品ページの「コレクションに追加」、題名・公開は一覧の「編集」で行う（YouTube の再生リストと同じ） -->
			{#if SHOW_COPY_LINK && collection.is_public}
				<div class="collection-actions">
					<button type="button" class="btn btn-secondary collection-action" onclick={copyLink}>
						<span class={copied ? 'i-lucide-check' : 'i-lucide-link'} aria-hidden="true"></span>
						{copied ? 'コピーしました' : 'リンクをコピー'}
					</button>
				</div>
			{/if}
		</header>

		{#if collection.items.length === 0}
			<div class="empty-state">
				<p>
					{data.isOwn
						? 'まだ作品がありません。作品のページの「コレクションに追加」から入れられます'
						: 'まだ作品がありません'}
				</p>
			</div>
		{:else}
			<ol class="collection-grid">
				{#each collection.items as anime, index (anime.id)}
					{@const myStatus = data.myStatuses[anime.id]}
					<li>
						<a href="/anime/{anime.id}" class="collection-card">
							<span class="collection-card-cover">
								{#if anime.cover_url}
									<img src={anime.cover_url} alt="" loading={index < 8 ? 'eager' : 'lazy'}>
								{:else}
									<span
										class="collection-card-cover-empty i-lucide-clapperboard"
										aria-hidden="true"
									></span>
								{/if}
							</span>
							<span class="collection-card-title">{anime.title}</span>
							<!-- 見ている人のマイリストでの状態（コレクションからマイリストへつなぐ手がかり） -->
							{#if myStatus}
								<span class="collection-card-status">
									<span class={ANIME_STATUS_ICONS[myStatus]} aria-hidden="true"></span>
									{ANIME_STATUS_LABELS[myStatus]}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

<style>
.collection-page {
	padding-bottom: 32px;
}
.collection-header {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 20px 16px 16px;
	border-bottom: 1px solid var(--color-border);
}
.collection-back {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 4px;
	margin-bottom: 4px;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}
.collection-back:hover {
	color: var(--color-text);
}
.collection-owner {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	align-self: flex-start;
	color: var(--color-text-muted);
	font-size: 13px;
	text-decoration: none;
}
.collection-owner:hover {
	color: var(--color-text);
}
.collection-title {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin: 0;
	font-size: 22px;
	font-weight: 800;
	line-height: 1.35;
	overflow-wrap: anywhere;
}
.collection-private-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border: 1px solid var(--color-border-hover);
	border-radius: 999px;
	corner-shape: round;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 600;
}
.collection-description {
	margin: 0;
	font-size: 14px;
	line-height: 1.7;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.collection-meta {
	margin: 0;
	color: var(--color-text-muted);
	font-size: 13px;
}
.collection-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 4px;
}
.collection-action {
	font-size: 13px;
}
.collection-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 18px 12px;
	margin: 0;
	padding: 16px;
	list-style: none;
}
@media (max-width: 480px) {
	.collection-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px 10px;
	}
}
.collection-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	color: var(--color-text);
	text-decoration: none;
}
.collection-card-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg-card);
	transition: opacity 0.15s;
}
.collection-card:hover .collection-card-cover {
	opacity: 0.85;
}
.collection-card-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.collection-card-cover-empty {
	width: 24px;
	height: 24px;
	color: var(--color-text-muted);
}
.collection-card-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 13px;
	line-height: 1.4;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.collection-card-status {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--color-text-muted);
	font-size: 12px;
}
</style>
