<script lang="ts">
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import CollectionShareCard from "$lib/components/CollectionShareCard.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { contentWarningLabel, hasContentWarning } from "$lib/content-warning";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";
import type { PostController } from "./post-controller.svelte";

interface Props {
	controller: PostController;
	/** 引用した作品をカードで出す（ルームの中やルームの投稿では出さない） */
	animeCard?: boolean;
}

let { controller, animeCard = false }: Props = $props();

const post = $derived(controller.post);

function openExchangeModal(event: Event) {
	event.preventDefault();
	event.stopPropagation();
	controller.exchangeModalOpen = true;
}

function openLightbox(event: MouseEvent, url: string) {
	event.preventDefault();
	event.stopPropagation();
	controller.lightboxUrl = url;
}
</script>

{#if post.quoted_post}
	<a href="/posts/{post.quoted_post.id}" class="quoted-post" onclick={(e) => e.stopPropagation()}>
		<div class="quoted-post-header">
			<UserAvatar src={post.quoted_post.avatar_url} username={post.quoted_post.username} size="sm" />
			<span class="quoted-post-name">{post.quoted_post.display_name || post.quoted_post.username}</span>
			<span class="quoted-post-at">@{post.quoted_post.username}</span>
		</div>
		{#if hasContentWarning(post.quoted_post)}
			<!-- 引用元の CW は引用枠でも守る。本文は元の投稿を開いて展開したときだけ見せる（#319） -->
			<p class="quoted-post-content quoted-post-cw">
				<span class="i-lucide-triangle-alert" aria-hidden="true"></span>
				{contentWarningLabel(post.quoted_post)}
			</p>
		{:else}
			<p class="quoted-post-content">{post.quoted_post.content}</p>
		{/if}
	</a>
{/if}

{#if post.exchange_share}
	<!-- カード全体を押せるように、中身の上に透明なボタンを重ねる（ブロック要素を含むので button で包めない） -->
	<div class="exchange-share-inline">
		<button
			type="button"
			class="exchange-share-hitarea"
			aria-label={`トレード結果を見る: ${post.exchange_share.offered_anime.title} から ${post.exchange_share.received_anime.title}`}
			onclick={openExchangeModal}
		></button>
		<AnimeExchangeResult
			offeredAnime={post.exchange_share.offered_anime}
			receivedAnime={post.exchange_share.received_anime}
			offeredComment={post.exchange_share.offered_comment}
			receivedComment={post.exchange_share.received_comment}
			offeredSubjectiveTags={post.exchange_share.offered_subjective_tags}
			receivedSubjectiveTags={post.exchange_share.received_subjective_tags}
			mode="timeline"
			linkCards={false}
		/>
	</div>
{:else if post.anime_quote && animeCard}
	<a href="/anime/{post.anime_quote.id}" class="anime-quote-card" onclick={(e) => e.stopPropagation()}>
		{#if post.anime_quote.cover_url}
			<img
				src={coverThumbSrc(post.anime_quote.cover_url)}
				{@attach coverThumbFallback(post.anime_quote.cover_url)}
				alt=""
				class="anime-quote-cover"
				loading="lazy"
			>
		{:else}
			<div class="anime-quote-cover anime-quote-cover-empty"></div>
		{/if}
		<div class="anime-quote-body">
			<span class="anime-quote-title">{post.anime_quote.title}</span>
			{#if post.anime_quote.meta || post.anime_quote.avg_score != null}
				<span class="anime-quote-meta">
					{#if post.anime_quote.meta}
						<span>{post.anime_quote.meta}</span>
					{/if}
					{#if post.anime_quote.avg_score != null}
						<!-- 一覧カードと同じ出し方（星だけ黄色、数字は平均） -->
						<span class="anime-quote-score">
							<span class="anime-quote-star" aria-hidden="true">★</span>
							<span class="sr-only">平均スコア</span>
							{post.anime_quote.avg_score.toFixed(2)}
						</span>
					{/if}
				</span>
			{/if}
		</div>
	</a>
{/if}

<!-- シェアしたコレクション（193）。持ち主が非公開にした・消した・鍵で見られないときは、カードの代わりに知らせる -->
{#if post.collection_share}
	<CollectionShareCard share={post.collection_share} />
{:else if post.collection_id}
	<p class="collection-share-gone">
		<span class="i-lucide-folder-lock" aria-hidden="true"></span>
		このコレクションは見られません
	</p>
{/if}

{#if post.image_urls && post.image_urls.length > 0}
	<div class="post-images" class:post-images-single={post.image_urls.length === 1}>
		{#each post.image_urls as url, i}
			<button
				type="button"
				class="post-image-link"
				aria-label="画像 {i + 1} を拡大"
				onclick={(e) => openLightbox(e, url)}
			>
				<img src={url} alt="投稿画像 {i + 1}" class="post-image" loading="lazy" width="480" height="270">
			</button>
		{/each}
	</div>
{/if}

<style>
.collection-share-gone {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 8px 0 0;
	padding: 10px 12px;
	border: 1px dashed var(--color-border);
	border-radius: var(--radius-sm);
	color: var(--color-text-muted);
	font-size: 13px;
}
</style>
