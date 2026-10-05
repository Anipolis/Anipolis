<script lang="ts">
import { page } from "$app/state";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import type { Anime, TrendingHashtag } from "$lib/types";
import InfoTip from "./InfoTip.svelte";

interface Props {
	trending: TrendingHashtag[];
	animeTrending?: Anime[];
}

let { trending, animeTrending = [] }: Props = $props();

// ログイン中は設定タブから辿れるので、未ログイン時だけ規約系リンクを出す
const showFooterLinks = $derived(!page.data.user);
</script>

<section class="trending-panel">
	<div class="trending-header with-info-tip">
		トレンド
		<InfoTip
			label="トレンド"
			text="直近24時間に投稿されたハッシュタグの件数順です。実況ルームの投稿は、その作品やイベントのハッシュタグとして数えます。鍵アカウントの投稿は含みません。"
		/>
	</div>

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

	<div class="trending-subheader with-info-tip">
		アニメトレンド
		<InfoTip label="アニメトレンド" text="直近7日間にマイリストへ登録された数が多い作品です。" />
	</div>

	{#if animeTrending.length === 0}
		<div class="trending-empty">まだアニメトレンドがありません</div>
	{:else}
		{#each animeTrending as anime, index}
			<a href="/anime/{anime.id}" class="trending-item anime-trending-item">
				<span class="trending-rank">{index + 1}</span>
				{#if anime.cover_url}
					<img
						class="anime-trending-cover"
						src={coverThumbSrc(anime.cover_url)}
						{@attach coverThumbFallback(anime.cover_url)}
						alt=""
						loading="lazy"
					>
				{/if}
				<span class="anime-trending-title">{anime.title}</span>
				<span class="trending-count">{(anime.recent_count ?? 0).toLocaleString('ja-JP')}件</span>
			</a>
		{/each}
	{/if}
</section>

{#if showFooterLinks}
	<div class="trending-panel-footer-links">
		<a href="/terms" class="trending-panel-footer-link">利用規約</a>
		<span aria-hidden="true">·</span>
		<a href="/privacy-policy" class="trending-panel-footer-link">プライバシーポリシー</a>
		<span aria-hidden="true">·</span>
		<a href="/data-sources" class="trending-panel-footer-link">出典・権利</a>
		<span aria-hidden="true">·</span>
		<a href="/contact" class="trending-panel-footer-link">お問い合わせ</a>
	</div>
{/if}
