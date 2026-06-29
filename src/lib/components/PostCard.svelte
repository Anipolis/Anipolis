<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import AnimeExchangeResult from "$lib/components/AnimeExchangeResult.svelte";
import LiveRoomPostCard from "$lib/components/LiveRoomPostCard.svelte";
import ReactionUsersPopover from "$lib/components/ReactionUsersPopover.svelte";
import { buildAnimeRoomLabel, type Post, type ReactionType, type ReactionUser } from "$lib/types";
import { formatBroadcastRelativeTime, formatRelativeTime } from "$lib/utils/format";
import { parseContentParts } from "$lib/utils/hashtag";
import BroadcastTimestamp from "./BroadcastTimestamp.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	isDetailView?: boolean;
	roomContext?: { href: string; title: string } | null;
	insideRoom?: boolean;
	broadcastStartAt?: string | null;
	roomPostMode?: "live" | null;
}

let {
	post,
	currentUserId = null,
	isDetailView = false,
	roomContext = null,
	insideRoom = false,
	broadcastStartAt = null,
	roomPostMode = null,
}: Props = $props();

const parts = $derived(parseContentParts(post.content));
const relativeTime = $derived(formatRelativeTime(post.created_at));
const broadcastRelativeTime = $derived(
	broadcastStartAt ? formatBroadcastRelativeTime(post.created_at, broadcastStartAt) : null,
);
const absoluteTimeStr = $derived(
	new Date(post.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
);
const displayName = $derived(post.display_name || post.username);
const isOwn = $derived(!!currentUserId && currentUserId === post.user_id);
const isLoggedIn = $derived(!!currentUserId);
const effectiveRoomContext = $derived(
	roomContext ??
		(post.anime_quote?.room_href
			? { href: post.anime_quote.room_href, title: buildAnimeRoomLabel(post.anime_quote) }
			: null),
);
const cwContentId = $derived(`post-cw-content-${post.id}`);

const isLong = $derived(post.content.length > 300 || (post.content.match(/\n/g)?.length ?? 0) >= 5);
let collapsed = $state(true);
let cwRevealed = $state(false);

let deleting = $state(false);
let lightboxUrl = $state<string | null>(null);
let showDeleteModal = $state(false);
let showKebabMenu = $state(false);
let showRepostMenu = $state(false);
let showQuoteModal = $state(false);
let showExchangeModal = $state(false);
let showReportModal = $state(false);
let deleteFormEl = $state<HTMLFormElement | null>(null);
let quoteText = $state("");
let quoteSubmitting = $state(false);
let quoteError = $state("");
let reportReason = $state("spam");
let reportDetails = $state("");
let reportSubmitting = $state(false);
let reportMessage = $state("");
let openReactionType = $state<ReactionType | null>(null);
let reactionUsers = $state<ReactionUser[]>([]);
let reactionUsersLoading = $state(false);
let reactionUsersError = $state("");

function openLightbox(event: MouseEvent, url: string) {
	event.preventDefault();
	event.stopPropagation();
	lightboxUrl = url;
}

function closeLightbox() {
	lightboxUrl = null;
}

function handleCardClick(e: MouseEvent) {
	if (isDetailView) return;
	if ((e.target as HTMLElement).closest("a, button")) return;
	goto(`/posts/${post.id}`);
}

function handleLightboxKeydown(event: KeyboardEvent) {
	if (lightboxUrl && event.key === "Escape") closeLightbox();
	if (showDeleteModal && event.key === "Escape") showDeleteModal = false;
	if (showExchangeModal && event.key === "Escape") showExchangeModal = false;
	if (showReportModal && event.key === "Escape") showReportModal = false;
	if (showKebabMenu && event.key === "Escape") showKebabMenu = false;
	if (openReactionType && event.key === "Escape") openReactionType = null;
}

function openExchangeModal(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	showExchangeModal = true;
}

function handleExchangePreviewKeydown(event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
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

function closeReactionPopover() {
	openReactionType = null;
}

async function openReactionPopover(event: MouseEvent, type: ReactionType) {
	event.preventDefault();
	event.stopPropagation();
	if (openReactionType === type) {
		closeReactionPopover();
		return;
	}
	showRepostMenu = false;
	openReactionType = type;
	reactionUsers = [];
	reactionUsersError = "";
	reactionUsersLoading = true;
	try {
		const response = await fetch(`/api/posts/${encodeURIComponent(post.id)}/reactions?type=${type}`);
		const body = (await response.json().catch(() => ({}))) as {
			users?: ReactionUser[];
			message?: string;
		};
		if (openReactionType !== type) return;
		if (!response.ok) {
			reactionUsersError = body.message ?? "一覧を取得できませんでした";
		} else {
			reactionUsers = body.users ?? [];
		}
	} catch {
		if (openReactionType === type) reactionUsersError = "一覧を取得できませんでした";
	} finally {
		if (openReactionType === type) reactionUsersLoading = false;
	}
}

const handleDelete: SubmitFunction = () => {
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

{#if roomPostMode === "live"}
	<LiveRoomPostCard {post} {currentUserId} {broadcastStartAt} />
{:else}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article
	class="post-card"
	class:deleting
	class:post-card--detail={isDetailView}
	class:post-card-clickable={!isDetailView}
	class:post-card-modal-open={showDeleteModal || showExchangeModal || showQuoteModal || showReportModal || !!lightboxUrl}
	class:post-card--with-room={!!effectiveRoomContext && !insideRoom}
	onclick={handleCardClick}
>
	{#if !isDetailView}
		<a href="/posts/{post.id}" class="post-card-hitarea" aria-label="投稿詳細を開く"></a>
	{/if}

	{#if effectiveRoomContext && !insideRoom}
		<a href={effectiveRoomContext.href} class="post-room-link" onclick={(e) => e.stopPropagation()}>
			<span class="i-lucide-door-open" aria-hidden="true"></span>
			<span>{effectiveRoomContext.title}</span>
		</a>
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
				{#if broadcastRelativeTime}
					<BroadcastTimestamp relativeTime={broadcastRelativeTime} absoluteTime={absoluteTimeStr} />
				{:else}
					<span class="post-time" title={post.created_at}>
						<time datetime={post.created_at}>{relativeTime}</time>
					</span>
				{/if}
				{#if isOwn}
					<form
						method="POST"
						action="?/deletePost"
						use:enhance={handleDelete}
						bind:this={deleteFormEl}
						style="display:none"
					>
						<input type="hidden" name="post_id" value={post.id}>
					</form>
				{/if}
				{#if isLoggedIn}
					<div class="post-kebab-wrapper">
						<button
							type="button"
							class="post-kebab-btn"
							aria-label="メニュー"
							aria-haspopup="true"
							onclick={(e) => { e.stopPropagation(); showKebabMenu = !showKebabMenu; }}
						>
							<span class="i-lucide-ellipsis-vertical" aria-hidden="true"></span>
						</button>
						{#if showKebabMenu}
							<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
							<div
								class="post-kebab-backdrop"
								role="presentation"
								onclick={(e) => { e.stopPropagation(); showKebabMenu = false; }}
							></div>
							<div class="post-kebab-menu" role="menu">
								{#if isOwn}
									<button
										type="button"
										class="post-kebab-item post-kebab-item--danger"
										role="menuitem"
										onclick={(e) => { e.stopPropagation(); showKebabMenu = false; showDeleteModal = true; }}
									>
										<span class="i-lucide-trash-2" aria-hidden="true"></span>
										削除
									</button>
								{:else}
									<button
										type="button"
										class="post-kebab-item"
										role="menuitem"
										onclick={(e) => { e.stopPropagation(); showKebabMenu = false; showReportModal = true; }}
									>
										<span class="i-lucide-flag" aria-hidden="true"></span>
										通報
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div class="post-content-outer">
			{#if post.cw_anime}
				<button
					type="button"
					class="post-cw-banner"
					class:post-cw-banner--revealed={cwRevealed}
					aria-expanded={cwRevealed}
					aria-controls={cwContentId}
					onclick={(e) => { e.stopPropagation(); cwRevealed = !cwRevealed; }}
				>
					<span class="post-cw-main">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
							/>
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
						<span> 『{post.cw_anime.title}』のネタバレを{cwRevealed ? '展開中' : '含みます'} </span>
					</span>
					<span class="post-cw-tap">{cwRevealed ? 'クリックで隠す △' : 'タップして表示 ▽'}</span>
				</button>
				<div
					id={cwContentId}
					class="post-cw-content"
					class:post-cw-content--revealed={cwRevealed}
					aria-hidden={!cwRevealed}
					inert={!cwRevealed}
				>
					<div class="post-cw-content-body">
						<div
							class="post-content-inner"
							class:post-content-clipped={isLong && collapsed && !isDetailView}
						>
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
						</div>
						{#if isLong && !isDetailView}
							<button
								type="button"
								class="post-content-toggle"
								onclick={(e) => { e.stopPropagation(); collapsed = !collapsed; }}
							>
								{collapsed ? 'もっと見る' : '閉じる'}
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<div class="post-content-inner" class:post-content-clipped={isLong && collapsed && !isDetailView}>
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
				</div>
				{#if isLong && !isDetailView}
					<button
						type="button"
						class="post-content-toggle"
						onclick={(e) => { e.stopPropagation(); collapsed = !collapsed; }}
					>
						{collapsed ? 'もっと見る' : '閉じる'}
					</button>
				{/if}
			{/if}
		</div>

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
				aria-label="交換結果を見る"
				onclick={openExchangeModal}
				onkeydown={handleExchangePreviewKeydown}
			>
				<AnimeExchangeResult
					offeredAnime={post.exchange_share.offered_anime}
					receivedAnime={post.exchange_share.received_anime}
					offeredComment={post.exchange_share.offered_comment}
					receivedComment={post.exchange_share.received_comment}
					mode="timeline"
					linkCards={false}
				/>
			</div>
		{:else if post.anime_quote && !effectiveRoomContext}
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
						<img src={url} alt="投稿画像 {i + 1}" class="post-image" loading="lazy">
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
							<p class="flash-error" style="margin-top:8px;">{quoteError}</p>
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
			<div
				class="exchange-result-modal-overlay"
				role="presentation"
				onclick={(e) => { e.stopPropagation(); showExchangeModal = false; }}
			>
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
							offeredComment={post.exchange_share.offered_comment}
							receivedComment={post.exchange_share.received_comment}
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
				onclick={(e) => { e.stopPropagation(); closeLightbox(); }}
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
			<div
				class="report-modal-overlay"
				role="presentation"
				onclick={(e) => { e.stopPropagation(); showReportModal = false; }}
			>
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

		{#if showDeleteModal}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="delete-modal-overlay"
				role="presentation"
				onclick={(e) => { e.stopPropagation(); showDeleteModal = false; }}
			>
				<div
					class="delete-modal-card"
					role="dialog"
					aria-modal="true"
					aria-labelledby="delete-modal-title"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
				>
					<div class="delete-modal-header">
						<span id="delete-modal-title" class="delete-modal-title">投稿を削除</span>
					</div>
					<div class="delete-modal-body">
						<p>この投稿を削除しますか？この操作は取り消せません。</p>
					</div>
					<div class="delete-modal-footer">
						<button type="button" class="btn btn-ghost" onclick={() => (showDeleteModal = false)}>
							キャンセル
						</button>
						<button
							type="button"
							class="btn btn-danger"
							onclick={() => { showDeleteModal = false; deleteFormEl?.requestSubmit(); }}
						>
							削除する
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="post-footer">
			<div class="post-footer-item">
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
						<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
					</svg>
					{#if post.reply_count > 0}
						<span>{post.reply_count}</span>
					{/if}
				</a>
			</div>

			<div class="post-footer-item">
				<div class="post-repost-wrapper reaction-action-group">
					<button
						type="button"
						class="post-action-btn post-repost-btn reaction-icon-hitbox"
						class:active={repostedByMe}
						disabled={!isLoggedIn}
						aria-label={repostedByMe ? 'リポストメニュー' : 'リポスト'}
						title={repostedByMe ? 'リポストメニュー' : 'リポスト'}
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
					</button>
					{#if isDetailView}
						{#if repostCount > 0}
							<button
								type="button"
								class="reaction-count-button post-repost-count reaction-count-hitbox"
								aria-label="リポストしたユーザーを表示"
								aria-expanded={openReactionType === 'repost'}
								onclick={(event) => openReactionPopover(event, 'repost')}
							>
								{repostCount}
							</button>
						{/if}
					{:else}
						<span class="reaction-count-static">{repostCount > 0 ? repostCount : ''}</span>
					{/if}

					{#if showRepostMenu}
						<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
						<div
							class="repost-backdrop"
							role="presentation"
							onclick={(e) => { e.stopPropagation(); showRepostMenu = false; }}
						></div>
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
					{#if openReactionType === 'repost'}
						<ReactionUsersPopover
							title="リポストしたユーザー"
							users={reactionUsers}
							loading={reactionUsersLoading}
							errorMessage={reactionUsersError}
							onClose={closeReactionPopover}
						/>
					{/if}
				</div>
			</div>

			<div class="post-footer-item">
				<div class="reaction-action-group">
					<form method="POST" action="?/like" use:enhance={handleLike}>
						<input type="hidden" name="post_id" value={post.id}>
						<button
							type="submit"
							class="post-action-btn post-like-btn reaction-icon-hitbox"
							class:active={likedByMe}
							disabled={!isLoggedIn}
							aria-label={likedByMe ? 'いいね取り消し' : 'いいね'}
							title={likedByMe ? 'いいね取り消し' : 'いいね'}
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
						</button>
					</form>
					{#if isDetailView && isOwn && likeCount > 0}
						<button
							type="button"
							class="reaction-count-button post-like-count reaction-count-hitbox"
							aria-label="いいねしたユーザーを表示"
							aria-expanded={openReactionType === 'like'}
							onclick={(event) => openReactionPopover(event, 'like')}
						>
							{likeCount}
						</button>
					{:else}
						<span class="reaction-count-static">{likeCount > 0 ? likeCount : ''}</span>
					{/if}
					{#if openReactionType === 'like'}
						<ReactionUsersPopover
							title="いいねしたユーザー"
							users={reactionUsers}
							loading={reactionUsersLoading}
							errorMessage={reactionUsersError}
							onClose={closeReactionPopover}
						/>
					{/if}
				</div>
			</div>

			<div class="post-footer-item">
				<form method="POST" action="?/bookmark" use:enhance={handleBookmark}>
					<input type="hidden" name="post_id" value={post.id}>
					<button
						type="submit"
						class="post-action-btn post-bookmark-btn"
						class:active={bookmarkedByMe}
						disabled={!isLoggedIn}
						aria-label={bookmarkedByMe ? 'ブックマーク解除' : 'ブックマーク'}
						title={bookmarkedByMe ? 'ブックマーク解除' : 'ブックマーク'}
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
			</div>
		</div>
	</div>
</article>
{/if}

<style>
.post-card--with-room {
	--post-content-offset: 50px;
	flex-wrap: wrap;
	column-gap: 10px;
	row-gap: 2px;
}

.post-room-link {
	flex: 0 0 calc(100% - var(--post-content-offset));
	display: inline-flex;
	align-items: center;
	gap: 5px;
	width: fit-content;
	max-width: calc(100% - var(--post-content-offset));
	margin: -4px 0 -2px var(--post-content-offset);
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
	line-height: 1.2;
	text-decoration: none;
}

.post-room-link:hover {
	color: var(--color-text-secondary);
	text-decoration: underline;
}

.post-room-link span:last-child {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.post-room-link [class^="i-lucide"] {
	flex-shrink: 0;
	width: 13px;
	height: 13px;
}

.post-card--detail.post-card--with-room .post-room-link {
	grid-column: 2;
	grid-row: 1;
	max-width: 100%;
	margin: -4px 0 -2px;
}

.post-card--detail.post-card--with-room {
	row-gap: 0;
}

.post-card--detail.post-card--with-room .post-avatar-link,
.post-card--detail.post-card--with-room .post-header {
	grid-row: 2;
}

.delete-modal-overlay {
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

.delete-modal-card {
	width: min(360px, 100%);
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-bg-card);
	box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}

.delete-modal-header {
	padding: 16px 16px 0;
}

.delete-modal-title {
	font-size: 15px;
	font-weight: 800;
}

.delete-modal-body {
	padding: 12px 16px 16px;
	color: var(--color-text-secondary);
	font-size: 14px;
}

.delete-modal-body p {
	margin: 0;
}

.delete-modal-footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	padding: 12px 16px;
	border-top: 1px solid var(--color-border);
}

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

.post-content-inner {
	position: relative;
}

.post-content-clipped {
	max-height: 200px;
	overflow: hidden;
}

.post-content-clipped::after {
	content: "";
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 80px;
	background: linear-gradient(to bottom, transparent, var(--color-bg-card));
	pointer-events: none;
}

.post-content-toggle {
	display: block;
	padding: 4px 0 0;
	color: var(--color-accent);
	font-size: 13px;
	font-weight: 700;
	background: none;
	border: none;
	cursor: pointer;
	text-align: left;
}

.post-content-toggle:hover {
	text-decoration: underline;
}

.post-cw-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	width: 100%;
	padding: 10px 12px;
	margin: 4px 0;
	border: 1px solid var(--color-warning, #f59e0b);
	background: color-mix(in srgb, var(--color-warning, #f59e0b) 8%, transparent);
	border-radius: var(--radius-md, 8px);
	cursor: pointer;
	font-size: 14px;
	text-align: center;
	color: var(--color-text);
	line-height: 1.4;
	transition:
		background 0.2s ease,
		border-color 0.2s ease;
}
.post-cw-banner:hover {
	background: color-mix(in srgb, var(--color-warning, #f59e0b) 16%, transparent);
}
.post-cw-banner--revealed {
	border-color: var(--color-border);
	background: color-mix(in srgb, var(--color-surface, #ffffff) 96%, var(--color-text-muted));
	color: var(--color-text-muted);
	border-bottom-right-radius: 4px;
	border-bottom-left-radius: 4px;
}
.post-cw-banner--revealed:hover {
	background: color-mix(in srgb, var(--color-surface, #ffffff) 92%, var(--color-text-muted));
}
.post-cw-main {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 0;
	gap: 8px;
	font-weight: 700;
}
.post-cw-banner--revealed .post-cw-main {
	font-weight: 500;
}
.post-cw-main svg {
	color: var(--color-warning, #f59e0b);
	flex-shrink: 0;
}
.post-cw-banner--revealed .post-cw-main svg {
	color: var(--color-text-muted);
}
.post-cw-tap {
	flex-shrink: 0;
	font-size: 12px;
	color: var(--color-text-muted);
}
.post-cw-content {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 0.3s ease;
}
.post-cw-content--revealed {
	grid-template-rows: 1fr;
}
.post-cw-content-body {
	min-height: 0;
	overflow: hidden;
	padding-top: 0;
	transition: padding-top 0.3s ease;
}
.post-cw-content--revealed .post-cw-content-body {
	padding-top: 8px;
}

@media (max-width: 640px) {
	.post-cw-banner {
		flex-direction: column;
		align-items: stretch;
	}
	.post-cw-tap {
		text-align: center;
	}
}
</style>
