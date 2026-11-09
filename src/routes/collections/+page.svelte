<script lang="ts">
import { collectionKindPrefix } from "$lib/collections";
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let creating = $state(false);
// 三点メニューを開いているコレクションと、編集中のコレクション（題名・説明・公開はここで直す）
let menuOpenId = $state<string | null>(null);
let editingId = $state<string | null>(null);
const editing = $derived(data.collections?.find((collection) => collection.id === editingId) ?? null);
</script>

<svelte:window
	onclick={() => (menuOpenId = null)}
	onkeydown={(event) => {
		if (event.key === "Escape") menuOpenId = null;
	}}
/>

<svelte:head><title>コレクション - Anipolis</title></svelte:head>

<div class="page-container">
	<main class="feed-column feed-column--wide collections-page">
		<header class="collections-header">
			<h1>コレクション</h1>
			{#if data.collections && data.collections.length > 0}
				<button type="button" class="btn btn-secondary collections-new" onclick={() => (creating = true)}>
					<span class="i-lucide-plus" aria-hidden="true"></span>
					新しいコレクション
				</button>
			{/if}
		</header>

		{#if data.collections === null}
			<div class="empty-state">
				<p>コレクションを読み込めませんでした。ページを再読み込みしてください</p>
			</div>
		{:else if data.collections.length === 0}
			<button type="button" class="collections-empty-add" onclick={() => (creating = true)}>
				<span class="i-lucide-plus" aria-hidden="true"></span>
				コレクションを作る
			</button>
		{:else}
			<ul class="collections-list">
				{#each data.collections as collection (collection.id)}
					<li class="collection-row">
						<a href="/collections/{collection.id}" class="collection-item">
							<!-- 先頭の4作品のカバー（足りない分は空の枠） -->
							<span class="collection-item-covers" aria-hidden="true">
								{#each [0, 1, 2, 3] as slot (slot)}
									<span class="collection-item-cover">
										{#if collection.covers[slot]}
											<img
												src={coverThumbSrc(collection.covers[slot])}
												{@attach coverThumbFallback(collection.covers[slot])}
												alt=""
												loading="lazy"
											>
										{/if}
									</span>
								{/each}
							</span>
							<span class="collection-item-body">
								<span class="collection-item-title">
									{collection.title}
									{#if !collection.is_public}
										<span class="collection-item-private">
											<span class="i-lucide-lock-keyhole" aria-hidden="true"></span>
											非公開
										</span>
									{/if}
								</span>
								{#if collection.description}
									<span class="collection-item-description">{collection.description}</span>
								{/if}
								<span class="collection-item-meta"
									>{collectionKindPrefix(collection.kind)}{collection.item_count}作品</span
								>
							</span>
						</a>
						<div class="collection-menu">
							<button
								type="button"
								class="collection-menu-btn"
								aria-label="「{collection.title}」のメニュー"
								aria-haspopup="menu"
								aria-expanded={menuOpenId === collection.id}
								onclick={(event) => {
									event.stopPropagation();
									menuOpenId = menuOpenId === collection.id ? null : collection.id;
								}}
							>
								<span class="i-lucide-ellipsis-vertical" aria-hidden="true"></span>
							</button>
							{#if menuOpenId === collection.id}
								<div class="collection-menu-dropdown" role="menu">
									<button
										type="button"
										role="menuitem"
										onclick={(event) => {
											event.stopPropagation();
											menuOpenId = null;
											editingId = collection.id;
										}}
									>
										<span class="i-lucide-pencil" aria-hidden="true"></span>
										編集
									</button>
									<!-- アニポリスの投稿でシェア（193）。公開のときだけ。外へのリンク共有と紛れないよう、アイコンはリポストと同じ -->
									{#if collection.is_public}
										<a role="menuitem" href="/?share_collection={collection.id}#compose">
											<span class="i-lucide-repeat-2" aria-hidden="true"></span>
											投稿でシェア
										</a>
									{/if}
								</div>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>

{#if editing}
	<!-- 送り先はそのコレクションのページのアクション。削除するとこの一覧へ戻る -->
	<CollectionFormModal
		mode="edit"
		action="/collections/{editing.id}?/updateCollection"
		deleteAction="/collections/{editing.id}?/deleteCollection"
		initial={{
			title: editing.title,
			description: editing.description,
			is_public: editing.is_public,
			kind: editing.kind,
			tiers: editing.tiers,
		}}
		onclose={() => {
			editingId = null;
		}}
	/>
{/if}

{#if creating}
	<CollectionFormModal
		mode="create"
		action="?/create"
		onclose={() => {
			creating = false;
		}}
	/>
{/if}

<style>
.collections-page {
	padding: 0;
}
.collections-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px 16px 4px;
}
.collections-header h1 {
	margin: 0;
	font-size: 1.25rem;
	font-weight: 700;
}
.collections-new {
	font-size: 13px;
}
.collections-empty-add {
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
.collections-empty-add:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.collections-list {
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 8px 0;
	list-style: none;
}
.collection-row {
	position: relative;
	display: flex;
	align-items: center;
}
.collection-row:hover {
	background: var(--color-surface-hover);
}
.collection-item {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 14px;
	min-width: 0;
	padding: 12px 4px 12px 16px;
	color: var(--color-text);
	text-decoration: none;
}
.collection-menu {
	position: relative;
	flex-shrink: 0;
	margin-right: 8px;
}
.collection-menu-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 20px;
}
.collection-menu-btn:hover,
.collection-menu-btn[aria-expanded="true"] {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.collection-menu-dropdown {
	position: absolute;
	top: calc(100% + 4px);
	right: 0;
	z-index: 100;
	min-width: 140px;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
}
.collection-menu-dropdown button,
.collection-menu-dropdown a {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 10px 14px;
	border: 0;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	font-size: 14px;
	text-align: left;
	text-decoration: none;
}
.collection-menu-dropdown button:hover,
.collection-menu-dropdown a:hover {
	background: var(--color-surface-hover);
}
.collection-item-covers {
	display: grid;
	flex-shrink: 0;
	grid-template-columns: repeat(2, 1fr);
	gap: 2px;
	width: 72px;
	overflow: hidden;
	border-radius: 8px;
	background: var(--color-border);
}
.collection-item-cover {
	display: block;
	aspect-ratio: 400 / 566;
	background: var(--color-bg-card);
}
.collection-item-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.collection-item-body {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.collection-item-title {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 15px;
	font-weight: 700;
	overflow-wrap: anywhere;
}
.collection-item-private {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 600;
}
.collection-item-description {
	display: -webkit-box;
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 13px;
	line-height: 1.5;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.collection-item-meta {
	color: var(--color-text-muted);
	font-size: 12px;
}
</style>
