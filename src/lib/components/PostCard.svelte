<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import type { Post } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import { parseContentParts } from "$lib/utils/hashtag";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	isDetailView?: boolean;
}

let { post, currentUserId = null, isDetailView = false }: Props = $props();

const parts = $derived(parseContentParts(post.content));
const relativeTime = $derived(formatRelativeTime(post.created_at));
const displayName = $derived(post.display_name || post.username);
const isOwn = $derived(!!currentUserId && currentUserId === post.user_id);
const isLoggedIn = $derived(!!currentUserId);

let deleting = $state(false);
let lightboxUrl = $state<string | null>(null);
let showRepostMenu = $state(false);
let showQuoteModal = $state(false);
let showExchangeModal = $state(false);
let showReportModal = $state(false);
let quoteText = $state("");
let quoteSubmitting = $state(false);
let quoteError = $state("");
let reportReason = $state("spam");
let reportDetails = $state("");
let reportSubmitting = $state(false);
let reportMessage = $state("");

function openLightbox(event: MouseEvent, url: string) {
	event.preventDefault();
	event.stopPropagation();
	lightboxUrl = url;
}

function closeLightbox() {
	lightboxUrl = null;
}

function handleLightboxKeydown(event: KeyboardEvent) {
	if (lightboxUrl && event.key === "Escape") closeLightbox();
	if (showExchangeModal && event.key === "Escape") showExchangeModal = false;
	if (showReportModal && event.key === "Escape") showReportModal = false;
}

function openExchangeModal(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	showExchangeModal = true;
}

let likeCountLocal = $state<number | null>(null);
let likedByMeLocal = $state<boolean | null>(null);
let repostCountLocal = $state<number | null>(null);
let repostedByMeLocal = $state<boolean | null>(null);
let bookmarkedByMeLocal = $state<boolean | null>(null);

const likeCount = $derived(likeCountLocal ?? post.like_count);
const likedByMe = $derived(likedByMeLocal ?? post.liked_by_me);
const repostCount = $derived(repostCountLocal ?? post.repost_count);
const repostedByMe = $derived(repostedByMeLocal ?? post.reposted_by_me);
const bookmarkedByMe = $derived(bookmarkedByMeLocal ?? post.bookmarked_by_me);

const handleDelete: SubmitFunction = ({ cancel }) => {
	if (!confirm("この投稿を削除しますか？")) return cancel();
	deleting = true;
	return async ({ update }) => {
		await update();
		deleting = false;
	};
};

const handleLike: SubmitFunction = () => {
	const wasLiked = likedByMe;
	likedByMeLocal = !wasLiked;
	likeCountLocal = wasLiked ? likeCount - 1 : likeCount + 1;
	return async ({ result, update }) => {
		if (result.type === "failure") {
			likedByMeLocal = null;
			likeCountLocal = null;
		}
		await update({ reset: false });
	};
};

const handleBookmark: SubmitFunction = () => {
	const wasBookmarked = bookmarkedByMe;
	bookmarkedByMeLocal = !wasBookmarked;
	return async ({ result, update }) => {
		if (result.type === "failure") {
			bookmarkedByMeLocal = null;
		}
		await update({ reset: false });
	};
};

const handleRepost: SubmitFunction = () => {
	showRepostMenu = false;
	const wasReposted = repostedByMe;
	repostedByMeLocal = !wasReposted;
	repostCountLocal = wasReposted ? repostCount - 1 : repostCount + 1;
	return async ({ result, update }) => {
		if (result.type === "failure") {
			repostedByMeLocal = null;
			repostCountLocal = null;
		}
		await update({ reset: false });
	};
};

async function submitQuoteRepost() {
	if (!quoteText.trim()) return;
	quoteSubmitting = true;
	quoteError = "";
	try {
		const fd = new FormData();
		fd.append("content", quoteText.trim());
		fd.append("quote_post_id", post.id);
		const res = await fetch("/api/posts", { method: "POST", body: fd });
		if (!res.ok) {
			const msg = await res.text();
			quoteError = msg || "投稿に失敗しました";
		} else {
			quoteText = "";
			showQuoteModal = false;
			repostedByMeLocal = true;
			repostCountLocal = repostCount + 1;
		}
	} catch {
		quoteError = "投稿に失敗しました";
	}
	quoteSubmitting = false;
}

async function submitReport() {
	reportSubmitting = true;
	reportMessage = "";
	try {
		const fd = new FormData();
		fd.append("target_type", "post");
		fd.append("target_id", post.id);
		fd.append("reason", reportReason);
		fd.append("details", reportDetails.trim());

		const res = await fetch("/api/reports", { method: "POST", body: fd });
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		if (!res.ok) {
			reportMessage = body.message ?? "通報の送信に失敗しました";
		} else {
			reportMessage = "通報を受け付けました";
			reportDetails = "";
			setTimeout(() => {
				showReportModal = false;
				reportMessage = "";
			}, 900);
		}
	} catch {
		reportMessage = "通報の送信に失敗しました";
	}
	reportSubmitting = false;
}
</script>

<svelte:window onkeydown={handleLightboxKeydown} />

<article
	class="post-card"
	class:deleting
	class:post-card-clickable={!isDetailView}
	class:post-card-modal-open={showExchangeModal || showQuoteModal || showReportModal || !!lightboxUrl}
>
	{#if !isDetailView}
		<a href="/posts/{post.id}" class="post-card-hitarea" aria-label="投稿詳細を開く"></a>
	{/if}

	<a href="/profile/{post.username}" class="post-avatar-link" aria-label={displayName}>
		<UserAvatar src={post.avatar_url} username={post.username} size="md" />
	</a>
	<div class="post-body">
		<div class="post-header">
			<div class="post-meta">
				<a href="/profile/{post.username}" class="post-username">{displayName}</a>
				<div class="post-display-name">@{post.username}</div>
			</div>
			<div class="post-header-right">
				<a href="/posts/{post.id}" class="post-time" title={post.created_at}>
					<time datetime={post.created_at}>{relativeTime}</time>
				</a>
				{#if isOwn}
					<form method="POST" action="?/deletePost" use:enhance={handleDelete}>
						<input type="hidden" name="post_id" value={post.id}>
						<button
							type="submit"
							class="post-delete-btn"
							disabled={deleting}
							aria-label="投稿を削除"
							title="削除"
						>
							✕
						</button>
					</form>
				{/if}
			</div>
		</div>

		<p class="post-content">
			{#each parts as part}
				{#if part.type === 'hashtag'}
					<a href="/hashtag/{part.value}" class="hashtag">#{part.value}</a>
				{:else if part.type === 'mention'}
					<a href="/profile/{part.value}" class="mention">@{part.value}</a>
				{:else}
					{part.value}
				{/if}
			{/each}
		</p>

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
			<button type="button" class="exchange-share-inline" aria-label="交換結果を見る" onclick={openExchangeModal}>
				<AnimeExchangeResult
					offeredAnime={post.exchange_share.offered_anime}
					receivedAnime={post.exchange_share.received_anime}
					mode="timeline"
					linkCards={false}
				/>
			</button>
		{:else if post.anime_quote}
			<a href="/anime/{post.anime_quote.id}" class="anime-quote-card" onclick={(e) => e.stopPropagation()}>
				{#if post.anime_quote.cover_url}
					<img
						src={post.anime_quote.cover_url}
						alt={post.anime_quote.title}
						class="anime-quote-cover"
						width="44"
						height="62"
						loading="lazy"
						decoding="async"
					>
				{:else}
					<div class="anime-quote-cover anime-quote-cover-empty"></div>
				{/if}
				<div class="anime-quote-body">
					<span class="anime-quote-label">アニメ</span>
					<span class="anime-quote-title">{post.anime_quote.title}</span>
					{#if post.anime_quote.user_score !== null}
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
						<img src={url} alt="投稿画像 {i + 1}" class="post-image" loading="lazy" decoding="async">
					</button>
				{/each}
			</div>
		{/if}

		{#if showQuoteModal}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
			<div
				class="quote-modal-overlay"
				role="presentation"
				onclick={({ target, currentTarget }) => { if (target === currentTarget) { showQuoteModal = false; quoteText = ''; quoteError = ''; } }}
			>
				<div
					class="quote-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="quote-modal-title"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<div class="quote-modal-header">
						<span id="quote-modal-title" class="quote-modal-title">引用リポスト</span>
						<button
							type="button"
							class="quote-modal-close"
							aria-label="閉じる"
							onclick={() => { showQuoteModal = false; quoteText = ''; quoteError = ''; }}
						>
							✕
						</button>
					</div>
					<div class="quote-modal-body">
						<textarea
							class="quote-modal-textarea"
							placeholder="コメントを追加..."
							rows="3"
							bind:value={quoteText}
							disabled={quoteSubmitting}
							aria-label="引用コメント"
						></textarea>
						<div class="quote-preview">
							<div class="quote-preview-header">
								<UserAvatar src={post.avatar_url} username={post.username} size="sm" />
								<span class="quote-preview-name">{post.display_name || post.username}</span>
								<span class="quote-preview-at">@{post.username}</span>
							</div>
							<p class="quote-preview-content">{post.content}</p>
						</div>
						{#if quoteError}
							<p class="flash-error" role="alert" style="margin-top:8px;">{quoteError}</p>
						{/if}
					</div>
					<div class="quote-modal-footer">
						<button
							type="button"
							class="btn btn-primary"
							disabled={!quoteText.trim() || quoteSubmitting}
							onclick={submitQuoteRepost}
						>
							{quoteSubmitting ? '投稿中…' : 'リポスト'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if showExchangeModal && post.exchange_share}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="exchange-result-modal-overlay" role="presentation" onclick={() => (showExchangeModal = false)}>
				<div
					class="exchange-result-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="exchange-result-modal-title"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="exchange-result-modal-header">
						<span id="exchange-result-modal-title" class="exchange-result-modal-title">交換結果</span>
						<button
							type="button"
							class="exchange-result-modal-close"
							aria-label="閉じる"
							onclick={() => (showExchangeModal = false)}
						>
							✕
						</button>
					</div>
					<div class="exchange-result-modal-body">
						<AnimeExchangeResult
							offeredAnime={post.exchange_share.offered_anime}
							receivedAnime={post.exchange_share.received_anime}
						/>
					</div>
					<div class="exchange-result-modal-footer">
						<a href="/exchange" class="exchange-result-modal-link">交流タブへ</a>
					</div>
				</div>
			</div>
		{/if}

		{#if lightboxUrl}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="lightbox-overlay"
				onclick={closeLightbox}
				role="dialog"
				aria-modal="true"
				aria-label="画像拡大表示"
				tabindex="-1"
			>
				<button
					type="button"
					class="lightbox-content"
					onclick={(e) => e.stopPropagation()}
					aria-label="拡大画像"
				>
					<img src={lightboxUrl} alt="拡大画像" class="lightbox-image">
				</button>
				<button type="button" class="lightbox-close" onclick={closeLightbox} aria-label="閉じる">✕</button>
			</div>
		{/if}

		{#if showReportModal}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="report-modal-overlay" role="presentation" onclick={() => (showReportModal = false)}>
				<div
					class="report-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="report-modal-title"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="report-modal-header">
						<span id="report-modal-title" class="report-modal-title">投稿を通報</span>
						<button
							type="button"
							class="report-modal-close"
							aria-label="閉じる"
							onclick={() => (showReportModal = false)}
						>
							✕
						</button>
					</div>
					<div class="report-modal-body">
						<label class="report-field">
							<span>理由</span>
							<select bind:value={reportReason}>
								<option value="spam">スパム</option>
								<option value="harassment">嫌がらせ</option>
								<option value="sexual">性的コンテンツ</option>
								<option value="violence">暴力的コンテンツ</option>
								<option value="illegal">違法・危険行為</option>
								<option value="other">その他</option>
							</select>
						</label>
						<label class="report-field">
							<span>補足</span>
							<textarea rows="3" maxlength="500" bind:value={reportDetails}></textarea>
						</label>
						{#if reportMessage}
							<p class="report-message">{reportMessage}</p>
						{/if}
					</div>
					<div class="report-modal-footer">
						<button
							type="button"
							class="btn btn-primary"
							disabled={reportSubmitting}
							onclick={submitReport}
						>
							{reportSubmitting ? '送信中...' : '送信'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="post-footer">
			<a href="/posts/{post.id}" class="post-action-btn post-reply-btn" aria-label="返信">
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				{#if post.reply_count > 0}
					<span>{post.reply_count}</span>
				{/if}
			</a>

			<div class="post-repost-wrapper">
				<button
					type="button"
					class="post-action-btn post-repost-btn"
					class:active={repostedByMe}
					disabled={!isLoggedIn}
					aria-label={repostedByMe ? 'リポストメニュー' : 'リポスト'}
					title={repostedByMe ? 'リポストメニュー' : 'リポスト'}
					aria-haspopup="true"
					aria-expanded={showRepostMenu}
					onclick={() => { if (isLoggedIn) showRepostMenu = !showRepostMenu; }}
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M17 1l4 4-4 4" />
						<path d="M3 11V9a4 4 0 0 1 4-4h14" />
						<path d="M7 23l-4-4 4-4" />
						<path d="M21 13v2a4 4 0 0 1-4 4H3" />
					</svg>
					{#if repostCount > 0}
						<span>{repostCount}</span>
					{/if}
				</button>

				{#if showRepostMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="repost-backdrop" role="presentation" onclick={() => showRepostMenu = false}></div>
					<div class="repost-dropdown">
						<form method="POST" action="?/repost" use:enhance={handleRepost}>
							<input type="hidden" name="post_id" value={post.id}>
							<button type="submit" class="repost-menu-item">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M17 1l4 4-4 4" />
									<path d="M3 11V9a4 4 0 0 1 4-4h14" />
									<path d="M7 23l-4-4 4-4" />
									<path d="M21 13v2a4 4 0 0 1-4 4H3" />
								</svg>
								{repostedByMe ? 'リポストを取り消す' : 'リポスト'}
							</button>
						</form>
						<button
							type="button"
							class="repost-menu-item repost-menu-item-quote"
							onclick={() => { showRepostMenu = false; showQuoteModal = true; }}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
							引用リポスト
						</button>
					</div>
				{/if}
			</div>

			<form method="POST" action="?/like" use:enhance={handleLike}>
				<input type="hidden" name="post_id" value={post.id}>
				<button
					type="submit"
					class="post-action-btn post-like-btn"
					class:active={likedByMe}
					disabled={!isLoggedIn}
					aria-label={likedByMe ? 'いいね取り消し' : 'いいね'}
					title={likedByMe ? 'いいね取り消し' : 'いいね'}
					aria-pressed={likedByMe}
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill={likedByMe ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
						/>
					</svg>
					{#if likeCount > 0}
						<span>{likeCount}</span>
					{/if}
				</button>
			</form>

			<form method="POST" action="?/bookmark" use:enhance={handleBookmark}>
				<input type="hidden" name="post_id" value={post.id}>
				<button
					type="submit"
					class="post-action-btn post-bookmark-btn"
					class:active={bookmarkedByMe}
					disabled={!isLoggedIn}
					aria-label={bookmarkedByMe ? 'ブックマーク解除' : 'ブックマーク'}
					title={bookmarkedByMe ? 'ブックマーク解除' : 'ブックマーク'}
					aria-pressed={bookmarkedByMe}
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill={bookmarkedByMe ? 'currentColor' : 'none'}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
					</svg>
				</button>
			</form>

			<button
				type="button"
				class="post-action-btn post-report-btn"
				disabled={!isLoggedIn || isOwn}
				aria-label="通報"
				title="通報"
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); showReportModal = true; }}
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
					<line x1="4" y1="22" x2="4" y2="15" />
				</svg>
			</button>
		</div>
	</div>
</article>

<style>
.report-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgba(0, 0, 0, 0.58);
	backdrop-filter: blur(3px);
}

.report-modal-card {
	width: min(420px, 100%);
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-bg-card);
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.report-modal-header,
.report-modal-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
	border-bottom: 1px solid var(--color-border);
}

.report-modal-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border);
	border-bottom: 0;
}

.report-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.report-modal-close {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 8px;
	color: var(--color-text-muted);
}

.report-modal-close:hover {
	background: var(--color-bg-hover);
	color: var(--color-text);
}

.report-modal-body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
}

.report-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 700;
}

.report-field select,
.report-field textarea {
	width: 100%;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	padding: 9px 10px;
	font-weight: 400;
}

.report-field textarea {
	resize: vertical;
}

.report-message {
	margin: 0;
	color: var(--color-text-secondary);
	font-size: 13px;
}

.post-report-btn:disabled {
	opacity: 0.35;
	cursor: not-allowed;
}
</style>
