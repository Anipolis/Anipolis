<script lang="ts">
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PostController } from "./post-controller.svelte";

interface Props {
	controller: PostController;
	/** Show the linked anime as a card (detail view only; rows show it inline instead). */
	animeCard?: boolean;
}

let { controller, animeCard = false }: Props = $props();

const post = $derived(controller.post);

function openExchangeModal(event: Event) {
	event.preventDefault();
	event.stopPropagation();
	controller.exchangeModalOpen = true;
}

function handleExchangePreviewKeydown(event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	openExchangeModal(event);
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
		<p class="quoted-post-content">{post.quoted_post.content}</p>
	</a>
{/if}

{#if post.exchange_share}
	<div
		class="exchange-share-inline"
		role="button"
		tabindex="0"
		aria-label={`トレード結果を見る: ${post.exchange_share.offered_anime.title} から ${post.exchange_share.received_anime.title}`}
		onclick={openExchangeModal}
		onkeydown={handleExchangePreviewKeydown}
	>
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
			<img src={post.anime_quote.cover_url} alt={post.anime_quote.title} class="anime-quote-cover">
		{:else}
			<div class="anime-quote-cover anime-quote-cover-empty"></div>
		{/if}
		<div class="anime-quote-body">
			<span class="anime-quote-label">アニメ</span>
			<span class="anime-quote-title">{post.anime_quote.title}</span>
			{#if post.anime_quote.user_score != null && post.anime_quote.user_score > 0}
				<span class="anime-quote-score">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path
							d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
						/>
					</svg>
					{post.anime_quote.user_score.toFixed(1)}
				</span>
			{/if}
		</div>
	</a>
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
