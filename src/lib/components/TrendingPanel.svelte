<script lang="ts">
import { page } from "$app/state";
import type { Anime, TrendingHashtag } from "$lib/types";
import AnimePosterTile from "./AnimePosterTile.svelte";
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
			<a href="/hashtag/{encodeURIComponent(tag.name)}" class="trending-item">
				<span class="trending-rank">{index + 1}</span>
				<span class="trending-name">#{tag.name}</span>
				<span class="trending-count">{tag.post_count.toLocaleString("ja-JP")}件</span>
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
				<li style:grid-row="{index + 1} / span 2">
					<AnimePosterTile
						href="/anime/{anime.id}"
						title={anime.title}
						coverUrl={anime.cover_url}
						rank={index + 1}
						note="{(anime.recent_count ?? 0).toLocaleString("ja-JP")}件"
					/>
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
}
</style>
