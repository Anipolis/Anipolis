<script lang="ts">
import { enhance } from "$app/forms";
import ReactionUsersPopover from "$lib/components/ReactionUsersPopover.svelte";
import LikeButton from "./LikeButton.svelte";
import type { PostController } from "./post-controller.svelte";

interface Props {
	controller: PostController;
	id?: string;
	/** Detail view: include the like button and emphasized, clickable counts. */
	detail?: boolean;
}

let { controller, id, detail = false }: Props = $props();

const post = $derived(controller.post);
const repostLabel = $derived(controller.repostedByMe ? "リポストメニュー" : "リポスト");
const bookmarkLabel = $derived(controller.bookmarkedByMe ? "ブックマーク解除" : "ブックマーク");
</script>

<div class="post-footer" {id}>
	<div class="post-footer-item">
		<div class="reaction-action-group">
			<a href="/posts/{post.id}" class="post-action-btn post-reply-btn reaction-icon-hitbox" aria-label="返信">
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
			</a>
			<span class="reaction-count-static" class:has-count={detail && post.reply_count > 0}
				>{post.reply_count > 0 ? post.reply_count : ''}</span
			>
		</div>
	</div>

	<div class="post-footer-item">
		<div class="post-repost-wrapper reaction-action-group">
			<button
				type="button"
				class="post-action-btn post-repost-btn reaction-icon-hitbox"
				class:active={controller.repostedByMe}
				disabled={!controller.isLoggedIn}
				aria-label={repostLabel}
				title={repostLabel}
				onclick={() => { if (controller.isLoggedIn) controller.repostMenuOpen = !controller.repostMenuOpen; }}
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
			{#if detail}
				{#if controller.repostCount > 0}
					<button
						type="button"
						class="reaction-count-button post-repost-count reaction-count-hitbox"
						aria-label="リポストしたユーザーを表示"
						aria-expanded={controller.openReactionType === 'repost'}
						onclick={(event) => controller.openReactionPopover(event, 'repost')}
					>
						{controller.repostCount}
					</button>
				{/if}
			{:else}
				<span class="reaction-count-static">{controller.repostCount > 0 ? controller.repostCount : ''}</span>
			{/if}

			{#if controller.repostMenuOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
				<div
					class="repost-backdrop"
					role="presentation"
					onclick={(e) => { e.stopPropagation(); controller.repostMenuOpen = false; }}
				></div>
				<div class="repost-dropdown">
					<form
						method="POST"
						action="?/repost"
						use:enhance={controller.handleRepost}
						bind:this={controller.repostForm}
					>
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
							{controller.repostedByMe ? 'リポストを取り消す' : 'リポスト'}
						</button>
					</form>
					<button
						type="button"
						class="repost-menu-item repost-menu-item-quote"
						onclick={() => { controller.repostMenuOpen = false; controller.quoteModalOpen = true; }}
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
			{#if controller.openReactionType === 'repost'}
				<ReactionUsersPopover
					title="リポストしたユーザー"
					users={controller.reactionUsers}
					loading={controller.reactionUsersLoading}
					errorMessage={controller.reactionUsersError}
					onClose={() => controller.closeReactionPopover()}
				/>
			{/if}
		</div>
	</div>

	{#if detail}
		<LikeButton {controller} detail />
	{/if}

	<div class="post-footer-item">
		<form method="POST" action="?/bookmark" use:enhance={controller.handleBookmark}>
			<input type="hidden" name="post_id" value={post.id}>
			<button
				type="submit"
				class="post-action-btn post-bookmark-btn reaction-icon-hitbox"
				class:active={controller.bookmarkedByMe}
				disabled={!controller.isLoggedIn}
				aria-label={bookmarkLabel}
				title={bookmarkLabel}
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill={controller.bookmarkedByMe ? 'currentColor' : 'none'}
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
