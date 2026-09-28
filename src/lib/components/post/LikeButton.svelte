<script lang="ts">
import { enhance } from "$app/forms";
import ReactionUsersPopover from "$lib/components/ReactionUsersPopover.svelte";
import type { PostController } from "./post-controller.svelte";

interface Props {
	controller: PostController;
	/** Detail view: emphasize the count and let the author see who liked. */
	detail?: boolean;
}

let { controller, detail = false }: Props = $props();

const label = $derived(controller.likedByMe ? "いいね取り消し" : "いいね");

// Play the pop only on a user-initiated like, not for posts already liked on load.
let popping = $state(false);
</script>

<div class="post-footer-item post-footer-like">
	<div class="reaction-action-group">
		{#if detail && controller.isOwn && controller.likeCount > 0}
			<button
				type="button"
				class="reaction-count-button post-like-count reaction-count-hitbox"
				aria-label="いいねしたユーザーを表示"
				aria-expanded={controller.openReactionType === 'like'}
				onclick={(event) => controller.openReactionPopover(event, 'like')}
			>
				{controller.likeCount}
			</button>
		{:else}
			<span class="reaction-count-static" class:has-count={detail && controller.likeCount > 0}
				>{controller.likeCount > 0 ? controller.likeCount : ''}</span
			>
		{/if}
		<form method="POST" action="?/like" use:enhance={controller.handleLike}>
			<input type="hidden" name="post_id" value={controller.post.id}>
			<button
				type="submit"
				class="post-action-btn post-like-btn reaction-icon-hitbox"
				class:active={controller.likedByMe}
				class:popping
				onclick={() => (popping = !controller.likedByMe)}
				onanimationend={() => (popping = false)}
				aria-pressed={controller.likedByMe}
				disabled={!controller.isLoggedIn}
				aria-label={label}
				title={label}
			>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill={controller.likedByMe ? 'currentColor' : 'none'}
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
		{#if controller.openReactionType === 'like'}
			<ReactionUsersPopover
				title="いいねしたユーザー"
				users={controller.reactionUsers}
				loading={controller.reactionUsersLoading}
				errorMessage={controller.reactionUsersError}
				onClose={() => controller.closeReactionPopover()}
			/>
		{/if}
	</div>
</div>
