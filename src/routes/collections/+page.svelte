<script lang="ts">
import CollectionFormModal from "$lib/components/CollectionFormModal.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let creating = $state(false);
</script>

<svelte:head><title>コレクション - Anipolis</title></svelte:head>

<div class="page-container">
	<main class="feed-column collections-page">
		<header class="collections-header">
			<h1>コレクション</h1>
			{#if data.collections && data.collections.length > 0}
				<button type="button" class="btn btn-secondary collections-new" onclick={() => (creating = true)}>
					<span class="i-lucide-plus" aria-hidden="true"></span>
					新しいコレクション
				</button>
			{/if}
		</header>
		<p class="collections-lead">
			作品を好きな切り口でまとめて残せます。公開にすると、リンクを知っている人が見られます
		</p>

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
					<li>
						<a href="/collections/{collection.id}" class="collection-item">
							<!-- 先頭の4作品のカバー（足りない分は空の枠） -->
							<span class="collection-item-covers" aria-hidden="true">
								{#each [0, 1, 2, 3] as slot (slot)}
									<span class="collection-item-cover">
										{#if collection.covers[slot]}
											<img src={collection.covers[slot]} alt="" loading="lazy">
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
								<span class="collection-item-meta">{collection.item_count}作品</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>

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
.collections-lead {
	margin: 0;
	padding: 0 16px 8px;
	border-bottom: 1px solid var(--color-border);
	color: var(--color-text-muted);
	font-size: 13px;
	line-height: 1.6;
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
.collection-item {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 16px;
	color: var(--color-text);
	text-decoration: none;
}
.collection-item:hover {
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
