<script lang="ts">
import type { Post } from "$lib/types";
import { formatRelativeTime } from "$lib/utils/format";
import { getPostDisplayContent, getPostRoomContext } from "$lib/utils/post-presentation";
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
}

let { post, currentUserId = null }: Props = $props();

const controller = new PostController(
	() => post,
	() => currentUserId,
);

const displayName = $derived(post.display_name || post.username);
const content = $derived(getPostDisplayContent(post));
const roomContext = $derived(getPostRoomContext(post));
const relativeTime = $derived(formatRelativeTime(post.created_at));

let menuOpen = $state(false);

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") menuOpen = false;
}
</script>

<svelte:window onkeydown={handleKeydown} />

<article
	class="post-detail"
	class:post-detail--deleting={controller.deleting}
	class:post-detail--modal-open={controller.modalOpen}
>
	{#if roomContext}
		<a href={roomContext.href} class="post-detail-room">
			<span class="i-lucide-door-open" aria-hidden="true"></span>
			<span>{roomContext.title}</span>
		</a>
	{/if}

	<header class="post-detail-head">
		<a href="/profile/{post.username}" class="post-avatar-link" aria-label={displayName}>
			<UserAvatar src={post.avatar_url} username={post.username} size="md" />
		</a>
		<div class="post-meta">
			<a href="/profile/{post.username}" class="post-username" title={displayName}>{displayName}</a>
			<div class="post-display-name">@{post.username}</div>
		</div>
		<span class="post-time" title={post.created_at}>
			<time datetime={post.created_at}>{relativeTime}</time>
		</span>
		{#if controller.isLoggedIn}
			<div class="post-kebab-wrapper">
				<button
					type="button"
					class="post-kebab-btn"
					aria-label="メニュー"
					aria-haspopup="true"
					onclick={() => (menuOpen = !menuOpen)}
				>
					<span class="i-lucide-ellipsis-vertical" aria-hidden="true"></span>
				</button>
				{#if menuOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="post-kebab-backdrop" role="presentation" onclick={() => (menuOpen = false)}></div>
					<div class="post-kebab-menu">
						{#if controller.isOwn}
							<button
								type="button"
								class="post-kebab-item post-kebab-item--danger"
								onclick={() => { menuOpen = false; controller.deleteModalOpen = true; }}
							>
								<span class="i-lucide-trash-2" aria-hidden="true"></span>
								削除
							</button>
						{:else}
							<button
								type="button"
								class="post-kebab-item"
								onclick={() => { menuOpen = false; controller.reportModalOpen = true; }}
							>
								<span class="i-lucide-flag" aria-hidden="true"></span>
								通報
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</header>

	<PostText {post} {content} />
	<PostEmbeds {controller} animeCard={!roomContext} />
	<ReactionErrorNotice feedback={controller.reactionFeedback} />
	<PostActionBar {controller} id="post-actions-{post.id}" detail />
	<PostOverlays {controller} {content} />
</article>

<style>
.post-detail {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 16px;
	border-bottom: 1px solid var(--color-border);
	border-left: 3px solid var(--color-border);
}
.post-detail--modal-open {
	z-index: 1100;
}
.post-detail--deleting {
	opacity: 0.5;
	pointer-events: none;
}

.post-detail-room {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	align-self: flex-start;
	max-width: 100%;
	margin-bottom: -2px;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
	line-height: 1.2;
	text-decoration: none;
}
.post-detail-room:hover {
	color: var(--color-text-secondary);
	text-decoration: underline;
}
.post-detail-room span:last-child {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.post-detail-room [class^="i-lucide"] {
	flex-shrink: 0;
	width: 13px;
	height: 13px;
}

.post-detail-head {
	display: flex;
	align-items: center;
	gap: 10px;
}

@media (max-width: 480px) {
	.post-detail {
		padding: 10px 12px;
	}
}
@media (max-width: 375px) {
	.post-detail {
		padding: 8px 10px;
	}
}
</style>
