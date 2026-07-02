<script lang="ts">
import type { Anime, TrendingHashtag } from "$lib/types";

interface Props {
	trending: TrendingHashtag[];
	animeTrending?: Anime[];
}

let { trending, animeTrending = [] }: Props = $props();
</script>

<section class="trending-panel">
	<div class="trending-header">トレンド</div>

	{#if trending.length === 0}
		<div class="trending-empty">まだトレンドがありません</div>
	{:else}
		{#each trending as tag, index}
			<a href="/hashtag/{tag.name}" class="trending-item">
				<span class="trending-rank">{index + 1}</span>
				<span class="trending-name">#{tag.name}</span>
				<span class="trending-count">{tag.post_count.toLocaleString('ja-JP')}件</span>
			</a>
		{/each}
	{/if}

	<div class="trending-subheader">アニメトレンド</div>

	{#if animeTrending.length === 0}
		<div class="trending-empty">まだアニメトレンドがありません</div>
	{:else}
		{#each animeTrending as anime, index}
			<a href="/anime/{anime.id}" class="trending-item anime-trending-item">
				<span class="trending-rank">{index + 1}</span>
				{#if anime.cover_url}
					<img class="anime-trending-cover" src={anime.cover_url} alt="" loading="lazy">
				{/if}
				<span class="anime-trending-title">{anime.title}</span>
				<span class="trending-count">{(anime.recent_count ?? 0).toLocaleString('ja-JP')}件</span>
			</a>
		{/each}
	{/if}
</section>

<a href="/privacy-policy" class="trending-panel-footer-link">プライバシーポリシー</a>
