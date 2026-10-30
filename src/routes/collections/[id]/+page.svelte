<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { toAnimePick } from "$lib/anime-picker";
import { ANIME_STATUS_ICONS, ANIME_STATUS_LABELS } from "$lib/anime-status";
import { MAX_COLLECTION_ITEMS } from "$lib/collections";
import AnimePickerModal from "$lib/components/AnimePickerModal.svelte";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
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

let pickingItems = $state(false);
let editingInfo = $state(false);
let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function saveItems(animeIds: number[]) {
	const response = await fetch(`/api/collections/${collection.id}/items`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ animeIds }),
	});
	const res = (await response.json().catch(() => ({}))) as { message?: string };
	if (!response.ok) throw new Error(res.message ?? "コレクションの保存に失敗しました");
	await invalidateAll();
}

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
			<a href="/profile/{collection.owner.username}?tab=collections" class="collection-owner">
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

			<div class="collection-actions">
				{#if data.isOwn}
					<button
						type="button"
						class="btn btn-secondary collection-action"
						onclick={() => (pickingItems = true)}
					>
						<span class="i-lucide-list-plus" aria-hidden="true"></span>
						作品を編集
					</button>
					<button
						type="button"
						class="btn btn-secondary collection-action"
						onclick={() => (editingInfo = true)}
					>
						<span class="i-lucide-pencil" aria-hidden="true"></span>
						題名・公開を編集
					</button>
				{/if}
				{#if collection.is_public}
					<button type="button" class="btn btn-secondary collection-action" onclick={copyLink}>
						<span class={copied ? 'i-lucide-check' : 'i-lucide-link'} aria-hidden="true"></span>
						{copied ? 'コピーしました' : 'リンクをコピー'}
					</button>
				{/if}
			</div>
		</header>

		{#if collection.items.length === 0}
			{#if data.isOwn}
				<button type="button" class="collection-empty-add" onclick={() => (pickingItems = true)}>
					<span class="i-lucide-plus" aria-hidden="true"></span>
					作品を追加
				</button>
			{:else}
				<div class="empty-state"><p>まだ作品がありません</p></div>
			{/if}
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

{#if pickingItems}
	<AnimePickerModal
		title="コレクションの作品"
		max={MAX_COLLECTION_ITEMS}
		initial={collection.items.map(toAnimePick)}
		onsave={saveItems}
		onclose={() => {
			pickingItems = false;
		}}
	/>
{/if}

{#if editingInfo}
	<CollectionFormModal
		mode="edit"
		action="?/updateCollection"
		deleteAction="?/deleteCollection"
		initial={{ title: collection.title, description: collection.description, is_public: collection.is_public }}
		onclose={() => {
			editingInfo = false;
		}}
	/>
{/if}

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
.collection-empty-add {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: calc(100% - 32px);
	margin: 16px;
	padding: 20px;
	border: 1px dashed var(--color-border-hover);
	border-radius: 12px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 14px;
}
.collection-empty-add:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
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
