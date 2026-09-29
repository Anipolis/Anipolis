<script lang="ts">
import type { Snippet } from "svelte";
import { goto } from "$app/navigation";
import type { Post } from "$lib/types";
import { formatBroadcastRelativeTime } from "$lib/utils/format";
import { getPostDisplayContent, getPostRoomContext } from "$lib/utils/post-presentation";
import LikeButton from "./post/LikeButton.svelte";
import PostActionBar from "./post/PostActionBar.svelte";
import PostEmbeds from "./post/PostEmbeds.svelte";
import PostOverlays from "./post/PostOverlays.svelte";
import PostText from "./post/PostText.svelte";
import { PostController } from "./post/post-controller.svelte";
import ReactionErrorNotice from "./ReactionErrorNotice.svelte";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	post: Post;
	currentUserId?: string | null;
	/** Same author as the previous row: the avatar is hidden until hover. */
	continuation?: boolean;
	/** Inside a live room, which already shows the room and anime context. */
	insideRoom?: boolean;
	broadcastStartAt?: string | null;
	/** When set, clicking the row toggles `children` (e.g. replies) instead of opening the post. */
	onExpand?: () => void;
	expanded?: boolean;
	children?: Snippet;
}

let {
	post,
	currentUserId = null,
	continuation = false,
	insideRoom = false,
	broadcastStartAt = null,
	onExpand,
	expanded = false,
	children,
}: Props = $props();

const controller = new PostController(
	() => post,
	() => currentUserId,
);

const displayName = $derived(post.display_name || post.username);
const content = $derived(getPostDisplayContent(post));
const roomContext = $derived(getPostRoomContext(post));
const broadcastRelativeTime = $derived(
	broadcastStartAt ? formatBroadcastRelativeTime(post.created_at, broadcastStartAt) : null,
);

let showActions = $state(false);
const actionsOpen = $derived(showActions || expanded);

function handleClick(e: MouseEvent) {
	if ((e.target as HTMLElement).closest("a, button, input, textarea, select, form")) return;
	if (window.getSelection()?.toString()) return;
	if (onExpand) {
		onExpand();
		return;
	}
	goto(`/posts/${post.id}`);
}

function toggleActions() {
	showActions = !actionsOpen;
	if (expanded) onExpand?.();
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") showActions = false;
}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article
	class="post-row"
	class:post-row--continuation={continuation}
	class:post-row--selected={actionsOpen}
	class:post-row--deleting={controller.deleting}
	class:post-row--modal-open={controller.modalOpen}
	onclick={handleClick}
>
	{#if onExpand}
		<button
			type="button"
			class="post-row-hitarea"
			aria-label="投稿の返信を表示"
			aria-expanded={expanded}
			onclick={onExpand}
		></button>
	{:else}
		<a href="/posts/{post.id}" class="post-row-hitarea" aria-label="投稿詳細を開く"></a>
	{/if}

	<div class="post-row-head">
		<a href="/profile/{post.username}" class="post-row-avatar" aria-label={displayName}>
			<UserAvatar src={post.avatar_url} username={post.username} size="sm" />
		</a>
		<a href="/profile/{post.username}" class="post-row-name" title={displayName}>{displayName}</a>
		<button
			type="button"
			class="post-row-menu"
			aria-label="投稿の操作"
			aria-expanded={actionsOpen}
			aria-controls="post-actions-{post.id}"
			onclick={toggleActions}
		>
			<span class="i-lucide-ellipsis" aria-hidden="true"></span>
		</button>
	</div>

	<div class="post-row-main">
		<div class="post-row-body">
			<PostText {post} {content} collapsible inline>
				{#snippet trailing()}
					{#if !insideRoom && roomContext}
						<a href={roomContext.href} class="post-inline-context" title={roomContext.title}
							><span class="i-lucide-door-open" aria-hidden="true"></span
							><span class="post-context-title">{roomContext.title}</span></a
						>
					{:else if !insideRoom && post.anime_quote && !post.exchange_share}
						<a
							href="/anime/{post.anime_quote.id}"
							class="post-inline-context"
							title={post.anime_quote.title}
							><span class="i-lucide-tv" aria-hidden="true"></span
							><span class="post-context-title">{post.anime_quote.title}</span></a
						>
					{/if}
				{/snippet}
			</PostText>
			<PostEmbeds {controller} />
		</div>
		<LikeButton {controller} />
	</div>

	<!-- 操作行を閉じたままのいいねでも見えるよう、展開ブロックの外に置く -->
	{#if controller.reactionFeedback.message}
		<div class="post-row-indent"><ReactionErrorNotice feedback={controller.reactionFeedback} /></div>
	{/if}

	{#if post.repost_context}
		<a href="/profile/{post.repost_context.username}" class="post-row-indent post-row-repost">
			<span class="i-lucide-repeat-2" aria-hidden="true"></span>
			<span>{post.repost_context.display_name || post.repost_context.username}さんがリポスト</span>
		</a>
	{/if}

	{#if actionsOpen}
		<div class="post-row-indent">
			<PostActionBar {controller} id="post-actions-{post.id}" />
			<div class="post-row-details">
				<a href="/posts/{post.id}" class="post-time"
					><time datetime={post.created_at}>{new Date(post.created_at).toLocaleString("ja-JP")}</time></a
				>
				{#if broadcastRelativeTime}
					<span class="post-time">放送開始から {broadcastRelativeTime}</span>
				{/if}
				{#if controller.isOwn}
					<button
						type="button"
						class="post-kebab-item post-kebab-item--danger"
						onclick={() => (controller.deleteModalOpen = true)}
					>
						削除
					</button>
				{:else if controller.isLoggedIn}
					<button type="button" class="post-kebab-item" onclick={() => (controller.reportModalOpen = true)}>
						通報
					</button>
				{/if}
			</div>
		</div>
	{/if}

	{#if expanded && children}
		<div class="post-row-indent">{@render children()}</div>
	{/if}

	<PostOverlays {controller} {content} />
</article>

<style>
.post-row {
	--post-row-pad-x: 12px;
	--post-row-avatar: 28px;
	--post-row-gap: 10px;
	--post-row-indent: calc(var(--post-row-avatar) + var(--post-row-gap));
	position: relative;
	display: flex;
	flex-direction: column;
	min-height: 46px;
	padding: 8px var(--post-row-pad-x);
	border-bottom: 1px solid var(--color-border);
	cursor: pointer;
	transition: background 0.1s;
	-webkit-tap-highlight-color: transparent;
}
.post-row:hover,
.post-row--selected {
	background: var(--color-surface-hover);
}
.post-row--modal-open {
	z-index: 1100;
}
.post-row--deleting {
	opacity: 0.5;
	pointer-events: none;
}

/* The hit area covers the row for keyboard users; content sits above it. */
.post-row-hitarea {
	position: absolute;
	inset: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}
.post-row-hitarea:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: -3px;
}
.post-row > :not(.post-row-hitarea) {
	position: relative;
}

.post-row-head {
	display: flex;
	align-items: center;
	gap: var(--post-row-gap);
	height: var(--post-row-avatar);
}
.post-row-avatar {
	display: flex;
	flex-shrink: 0;
}
.post-row-avatar :global(.avatar) {
	width: var(--post-row-avatar);
	height: var(--post-row-avatar);
	font-size: 12px;
}
.post-row-name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--color-text-muted);
	font-size: 12px;
	line-height: 18px;
	text-decoration: none;
}
.post-row-name:hover {
	color: var(--color-text-secondary);
	text-decoration: underline;
}
.post-row-menu {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 32px;
	height: var(--post-row-avatar);
	border: 0;
	border-radius: 4px;
	background: none;
	color: var(--color-text-muted);
	cursor: pointer;
}
.post-row-menu:hover {
	color: var(--color-accent);
	background: var(--accent-muted);
}

/* Text and like share the second line; the like stays pinned to the right edge. */
.post-row-main {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding-left: var(--post-row-indent);
}
.post-row-body {
	flex: 1;
	min-width: 0;
}
.post-row-body :global(.post-content) {
	margin: 0;
	font-size: 15px;
	line-height: 24px;
	overflow-wrap: anywhere;
}
.post-row-body :global(.post-images) {
	margin: 6px 0;
	gap: 4px;
}
.post-row-body :global(.post-image-link) {
	aspect-ratio: 16 / 9;
	height: auto;
	max-height: 300px;
	border-radius: 4px;
}
.post-row-body :global(.post-image) {
	width: 100%;
	height: 100%;
	object-fit: contain;
}
/* Fixed width so a growing like count never squeezes the text column. */
.post-row-main :global(.post-footer-like) {
	flex-shrink: 0;
	justify-content: flex-end;
	width: 56px;
}
.post-row-main :global(.post-footer-like > :first-child) {
	margin: 0;
}
.post-row-main :global(.reaction-action-group) {
	gap: 0;
}
.post-row-main :global(.reaction-count-static) {
	min-width: 0;
	font-size: 11px;
	font-variant-numeric: tabular-nums;
}
/* Square, but centered under the 32px menu button above. */
.post-row-main :global(.post-like-btn) {
	width: 26px;
	height: 26px;
	min-height: 0;
	margin: 0 4px 0 0;
	padding: 4.5px;
	justify-content: center;
}

.post-row-indent {
	padding-left: var(--post-row-indent);
}
.post-row-repost {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	align-self: flex-start;
	max-width: 100%;
	color: var(--color-text-muted);
	font-size: 11px;
	font-weight: 700;
	line-height: 20px;
	text-decoration: none;
}
.post-row-repost:hover {
	color: var(--color-text-secondary);
	text-decoration: underline;
}
.post-row-repost span:last-child {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.post-row-repost [class^="i-lucide"] {
	flex-shrink: 0;
	width: 13px;
	height: 13px;
}
.post-row-indent :global(.post-footer) {
	display: flex;
	gap: 20px;
	padding-top: 6px;
}
.post-row-details {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
	padding-bottom: 6px;
}
.post-row-details .post-time {
	font-size: 11px;
}
.post-row-details .post-kebab-item {
	width: auto;
	min-height: 36px;
	padding: 4px 8px;
}

.post-inline-context {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	max-width: 160px;
	margin-left: 10px;
	vertical-align: baseline;
	font-size: 11px;
	line-height: 20px;
	color: var(--color-text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.post-inline-context:hover {
	color: var(--color-accent);
}
.post-context-title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.post-row--continuation:not(:hover):not(:focus-within):not(.post-row--selected) .post-row-avatar {
	opacity: 0;
}
.post-row--continuation::before {
	content: "·";
	position: absolute;
	top: 8px;
	left: var(--post-row-pad-x);
	width: var(--post-row-avatar);
	color: var(--color-text-muted);
	line-height: var(--post-row-avatar);
	text-align: center;
}
.post-row--continuation:hover::before,
.post-row--continuation:focus-within::before,
.post-row--selected::before {
	display: none;
}

/* Keep 40px touch targets without pushing the head and text lines apart. */
@media (max-width: 960px) {
	.post-row-main :global(.post-like-btn),
	.post-row-menu {
		height: 40px;
		margin: -6px 0;
	}
	.post-row-main :global(.post-like-btn) {
		width: 40px;
		margin-right: -4px;
		padding: 6.5px;
	}
}
@media (max-width: 640px) {
	.post-row {
		--post-row-pad-x: 10px;
		--post-row-gap: 8px;
	}
	.post-inline-context {
		max-width: 100%;
	}
	.post-row-indent :global(.post-footer .post-action-btn) {
		min-width: 40px;
		min-height: 40px;
	}
}
</style>
