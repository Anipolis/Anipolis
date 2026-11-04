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

// 直近7日間に1件も登録が無い作品は、話題になっていないのに並ぶと「トレンド」に見えないので出さない（#437）
const activeAnimeTrending = $derived(animeTrending.filter((anime) => (anime.recent_count ?? 0) > 0));

// ログイン中は設定タブから辿れるので、未ログイン時だけ規約系リンクを出す
const showFooterLinks = $derived(!page.data.user);
</script>

<section class="trending-panel">
	<div class="trending-header with-info-tip">
		トレンド
		<InfoTip label="トレンド">
			<p>この24時間でよく使われたハッシュタグです。</p>
			<p>実況ルームの投稿も、その作品やイベントのハッシュタグとして数えます。</p>
			<p>鍵アカウントの投稿は数えません。</p>
		</InfoTip>
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
		<InfoTip label="アニメトレンド" text="この7日間でマイリストへの登録が多かった作品です。" />
	</div>

	{#if activeAnimeTrending.length === 0}
		<div class="trending-empty">まだアニメトレンドがありません</div>
	{:else}
		<ol class="anime-trending-grid">
			{#each activeAnimeTrending as anime, index (anime.id)}
				{@const count = (anime.recent_count ?? 0).toLocaleString('ja-JP')}
				<li style:grid-row="{index + 1} / span 2">
					<a
						href="/anime/{anime.id}"
						class="anime-trending-tile"
						class:anime-trending-tile--no-cover={!anime.cover_url}
						aria-label="{index + 1}位 {anime.title} {count}件"
					>
						{#if anime.cover_url}
							<img
								src={coverThumbSrc(anime.cover_url)}
								{@attach coverThumbFallback(anime.cover_url)}
								alt=""
								loading="lazy"
							>
						{/if}
						<span class="anime-trending-rank">{index + 1}</span>
						<span class="anime-trending-caption">
							<span class="anime-trending-title">{anime.title}</span>
							<span class="anime-trending-count">{count}件</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>
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

<style>
/* 順位ごとに左右へ互い違いに並べる。1枚を2行分にして、1行ずつずらして置くと右の列が半分下がる */
.anime-trending-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	grid-auto-rows: 1fr;
	gap: 8px;
	margin: 0;
	padding: 4px 16px 12px;
	list-style: none;
}

.anime-trending-grid li:nth-child(odd) {
	grid-column: 1;
}

.anime-trending-grid li:nth-child(even) {
	grid-column: 2;
}

.anime-trending-tile {
	position: relative;
	display: block;
	height: 100%;
	overflow: hidden;
	aspect-ratio: 400 / 566;
	border-radius: 6px;
	background: var(--color-surface-hover);
	color: #fff;
	text-decoration: none;
}

.anime-trending-tile:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

.anime-trending-tile img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.anime-trending-rank {
	position: absolute;
	top: 4px;
	left: 4px;
	min-width: 20px;
	padding: 2px 5px;
	border-radius: 6px;
	background: rgb(0 0 0 / 0.72);
	font-size: 0.72rem;
	font-weight: 800;
	line-height: 16px;
	text-align: center;
}

/* 題名はマウスを乗せるかキーボードで選ぶと出す（トレードの画像だけのカードと同じ） */
.anime-trending-caption {
	position: absolute;
	inset-inline: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 18px 7px 7px;
	background: linear-gradient(180deg, transparent, rgb(0 0 0 / 0.78));
	font-size: 0.72rem;
	line-height: 1.25;
	opacity: 0;
	transition: opacity 0.18s ease;
}

.anime-trending-tile:hover .anime-trending-caption,
.anime-trending-tile:focus-visible .anime-trending-caption {
	opacity: 1;
}

.anime-trending-title {
	display: -webkit-box;
	overflow: hidden;
	font-weight: 800;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.anime-trending-count {
	font-size: 0.68rem;
	opacity: 0.85;
}

/* カバーを出さない作品は、同じ大きさの枠に題名を文字で出す */
.anime-trending-tile--no-cover {
	color: var(--color-text);
}

.anime-trending-tile--no-cover .anime-trending-rank {
	color: #fff;
}

.anime-trending-tile--no-cover .anime-trending-caption {
	background: none;
	opacity: 1;
}

@media (hover: none) {
	.anime-trending-caption {
		opacity: 1;
	}
}

/* スマホは1列で横に送る。段差があると送りにくいのでそろえる */
@media (max-width: 768px) {
	.anime-trending-grid {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.anime-trending-grid::-webkit-scrollbar {
		display: none;
	}

	.anime-trending-grid li {
		flex: 0 0 104px;
	}

	.anime-trending-caption {
		opacity: 1;
	}
}
</style>
