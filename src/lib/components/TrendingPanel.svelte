<script lang="ts">
import type { TrendingHashtag } from "$lib/types";

interface Props {
	trending: TrendingHashtag[];
}

let { trending }: Props = $props();
</script>

<aside class="trending-panel">
	<div class="trending-header">トレンド</div>

	{#if trending.length === 0}
		<div style="padding: 16px; color: var(--color-text-muted); font-size: 14px;">まだトレンドがありません</div>
	{:else}
		{#each trending as tag, index}
			<a href="/hashtag/{tag.name}" class="trending-item">
				<span class="trending-rank">{index + 1}</span>
				<span class="trending-name">#{tag.name}</span>
				<span class="trending-count">{tag.post_count.toLocaleString('ja-JP')}件</span>
			</a>
		{/each}
	{/if}
</aside>
