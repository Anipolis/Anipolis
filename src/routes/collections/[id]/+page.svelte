<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import { toAnimePick } from "$lib/anime-picker";
import { ANIME_STATUS_ICONS, ANIME_STATUS_LABELS } from "$lib/anime-status";
import { MAX_COLLECTION_ITEMS } from "$lib/collections";
import AnimePickerModal from "$lib/components/AnimePickerModal.svelte";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import CollectionReorder from "$lib/components/CollectionReorder.svelte";
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

// 持ち主だけの道具: 作品を足す（＋）・題名などを直す（鉛筆）・並べ替える
let adding = $state(false);
let editingInfo = $state(false);
let reordering = $state(false);

/** 並びを丸ごと保存する（足す・並べ替える・外すのどれも、この形で送る） */
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

const reorderItems = $derived(
	collection.items.map((anime) => ({ id: Number(anime.id), title: anime.title, cover_url: anime.cover_url })),
);

// 並べ替え中の並び（変えるまでは null）。保存とキャンセルはタイトル横のボタンで行う
let pendingOrder = $state<number[] | null>(null);
let savingOrder = $state(false);
let orderError = $state("");
const orderChanged = $derived(
	pendingOrder !== null &&
		(pendingOrder.length !== reorderItems.length ||
			pendingOrder.some((id, index) => id !== reorderItems[index]?.id)),
);

function startReorder() {
	pendingOrder = null;
	orderError = "";
	reordering = true;
}

function cancelReorder() {
	reordering = false;
	pendingOrder = null;
	orderError = "";
}

async function saveOrder() {
	if (!pendingOrder || savingOrder) return;
	savingOrder = true;
	orderError = "";
	try {
		await saveItems(pendingOrder);
		cancelReorder();
	} catch (saveError) {
		orderError = saveError instanceof Error ? saveError.message : "保存に失敗しました";
	} finally {
		savingOrder = false;
	}
}

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
			<div class="collection-title-row">
				<h1 class="collection-title">
					{collection.title}
					{#if !collection.is_public}
						<span class="collection-private-badge">
							<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
							非公開
						</span>
					{/if}
				</h1>
				{#if data.isOwn && reordering}
					<div class="collection-tools">
						<button type="button" class="btn btn-ghost" disabled={savingOrder} onclick={cancelReorder}>
							キャンセル
						</button>
						<button
							type="button"
							class="btn {orderChanged ? 'btn-primary' : 'btn-secondary'}"
							disabled={!orderChanged || savingOrder}
							onclick={saveOrder}
						>
							{savingOrder ? '保存中...' : '保存する'}
						</button>
					</div>
				{:else if data.isOwn}
					<div class="collection-tools">
						<button
							type="button"
							class="collection-tool"
							aria-label="作品を追加"
							title="作品を追加"
							disabled={collection.items.length >= MAX_COLLECTION_ITEMS}
							onclick={() => (adding = true)}
						>
							<span class="i-lucide-plus" aria-hidden="true"></span>
						</button>
						<button
							type="button"
							class="collection-tool"
							aria-label="題名・説明・公開を編集"
							title="編集"
							onclick={() => (editingInfo = true)}
						>
							<span class="i-lucide-pencil" aria-hidden="true"></span>
						</button>
						<button
							type="button"
							class="collection-tool"
							aria-label="並べ替え・作品を外す"
							title="並べ替え"
							disabled={collection.items.length === 0}
							onclick={startReorder}
						>
							<span class="i-lucide-arrow-up-down" aria-hidden="true"></span>
						</button>
					</div>
				{/if}
			</div>
			{#if orderError}
				<p class="field-error-msg" role="alert">{orderError}</p>
			{/if}
			{#if collection.description}
				<p class="collection-description">{collection.description}</p>
			{/if}
			<p class="collection-meta">{collection.items.length}作品・{updatedLabel}更新</p>

			{#if SHOW_COPY_LINK && collection.is_public}
				<div class="collection-actions">
					<button type="button" class="btn btn-secondary collection-action" onclick={copyLink}>
						<span class={copied ? 'i-lucide-check' : 'i-lucide-link'} aria-hidden="true"></span>
						{copied ? 'コピーしました' : 'リンクをコピー'}
					</button>
				</div>
			{/if}
		</header>

		{#if reordering}
			<CollectionReorder
				items={reorderItems}
				disabled={savingOrder}
				onchange={(ids) => {
					pendingOrder = ids;
				}}
			/>
		{:else if collection.items.length === 0}
			<div class="empty-state">
				<p>
					{data.isOwn
						? 'まだ作品がありません。＋から追加できます'
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

{#if adding}
	<AnimePickerModal
		title="作品を追加"
		max={MAX_COLLECTION_ITEMS}
		initial={collection.items.map(toAnimePick)}
		addOnly
		onsave={saveItems}
		onclose={() => {
			adding = false;
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
.collection-title-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}
.collection-tools {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
}
.collection-tool {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font-size: 18px;
}
.collection-tool:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.collection-tool:disabled {
	cursor: not-allowed;
	opacity: 0.4;
}
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
