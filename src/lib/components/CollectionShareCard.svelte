<script lang="ts">
import { type CollectionShare, collectionTierColor } from "$lib/collections";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";

/**
 * 投稿でシェアしたコレクションのカード（193）。投稿の中ではコレクションのページへのリンク、
 * 投稿欄のプレビューではリンクにしない。中身は collection_preview の要約（先頭だけ）
 */
let { share, linked = true }: { share: CollectionShare; linked?: boolean } = $props();

const tierRows = $derived(
	share.kind === "tier"
		? share.tiers.slice(0, 5).map((label, tier) => ({
				label,
				tier,
				items: share.items.filter((item) => item.tier === tier),
			}))
		: [],
);
</script>

<!-- カバーが無い作品は、枠の真ん中に題名を出す（ランキングは横に題名があるので出さない） -->
{#snippet cover(item: CollectionShare['items'][number], showTitle = true)}
	<span class="collection-share-cover" title={item.title}>
		{#if item.cover_url}
			<img src={coverThumbSrc(item.cover_url)} {@attach coverThumbFallback(item.cover_url)} alt="" loading="lazy">
		{:else if showTitle}
			<span class="collection-share-cover-title">{item.title}</span>
		{/if}
	</span>
{/snippet}

{#snippet body()}
	<span class="collection-share-title">{share.title}</span>
	{#if share.items.length === 0}
		<span class="collection-share-empty">まだ作品がありません</span>
	{:else if share.kind === 'tier'}
		<span class="collection-share-tiers">
			{#each tierRows as row (row.tier)}
				<span class="collection-share-tier">
					<span class="collection-share-tier-head" style:background-color={collectionTierColor(row.tier)}
						>{row.label}</span
					>
					<span class="collection-share-tier-items">
						{#each row.items as item (item.id)}
							{@render cover(item)}
						{/each}
					</span>
				</span>
			{/each}
		</span>
	{:else if share.kind === 'ranking'}
		<span class="collection-share-ranking">
			{#each share.items.slice(0, 3) as item, index (item.id)}
				<span class="collection-share-rank">
					<span class="rank-cell rank-cell--{index + 1}">{index + 1}</span>
					{@render cover(item, false)}
					<span class="collection-share-rank-title">{item.title}</span>
				</span>
			{/each}
		</span>
	{:else}
		<span class="collection-share-strip">
			{#each share.items as item (item.id)}
				{@render cover(item)}
			{/each}
		</span>
	{/if}
{/snippet}

{#if linked}
	<a
		href="/collections/{share.id}"
		class="collection-share"
		aria-label="コレクション「{share.title}」を見る"
		onclick={(event) => event.stopPropagation()}
	>
		{@render body()}
	</a>
{:else}
	<div class="collection-share">{@render body()}</div>
{/if}

<style>
.collection-share {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 8px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-bg-card);
	color: var(--color-text);
	text-decoration: none;
}
a.collection-share:hover {
	background: var(--color-surface-hover);
}
.collection-share-title {
	font-size: 15px;
	font-weight: 800;
	line-height: 1.4;
}
.collection-share-empty {
	color: var(--color-text-muted);
	font-size: 13px;
}
.collection-share-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 44px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	background: var(--color-border);
}
.collection-share-cover-title {
	display: -webkit-box;
	overflow: hidden;
	padding: 0 3px;
	color: var(--color-text);
	font-size: 9px;
	font-weight: 600;
	line-height: 1.3;
	text-align: center;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 5;
	line-clamp: 5;
}
.collection-share-strip .collection-share-cover-title {
	font-size: 10px;
	-webkit-line-clamp: 6;
	line-clamp: 6;
}
.collection-share-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
/* リストは、カードの幅に入るだけ1列に並べる（幅を余らせず、2列目に回る分は隠す） */
.collection-share-strip {
	display: grid;
	grid-template-rows: auto;
	grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
	grid-auto-rows: 0;
	gap: 0 6px;
	overflow: hidden;
}
.collection-share-strip .collection-share-cover {
	width: auto;
	border-radius: 4px;
}
.collection-share-tiers,
.collection-share-ranking {
	display: flex;
	flex-direction: column;
	gap: 4px;
}
.collection-share-tier,
.collection-share-rank {
	display: flex;
	align-items: stretch;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 6px;
}
.collection-share-tier-head {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 44px;
	padding: 2px;
	color: #1a1a1a;
	font-size: 13px;
	font-weight: 800;
	overflow-wrap: anywhere;
	text-align: center;
}
.collection-share-tier-items {
	display: flex;
	min-height: calc(44px * 566 / 400);
	overflow: hidden;
}
.collection-share-rank {
	align-items: center;
}
.collection-share-rank .rank-cell {
	width: 40px;
	font-size: 16px;
}
.collection-share-rank-title {
	display: -webkit-box;
	overflow: hidden;
	padding: 0 12px;
	font-size: 13px;
	font-weight: 700;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
</style>
