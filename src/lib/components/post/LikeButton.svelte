<script lang="ts">
import { untrack } from "svelte";
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

// A trackpad tap presses and releases almost at once, so :active never shows the press-in.
// Hold the pressed look for a minimum time before the pop so tap and mouse look the same.
const MIN_PRESS_MS = 80;
let pressed = $state(false);
let pressStartedAt = 0;
let popTimer: ReturnType<typeof setTimeout> | undefined;

function onPointerDown() {
	pressStartedAt = performance.now();
	pressed = true;
}

function onLikeClick() {
	const shouldPop = !controller.likedByMe;
	clearTimeout(popTimer);
	// Keyboard activation has no pointerdown, so there is nothing to hold.
	const wait = pressed ? Math.max(0, MIN_PRESS_MS - (performance.now() - pressStartedAt)) : 0;
	popTimer = setTimeout(() => {
		pressed = false;
		popping = shouldPop;
	}, wait);
}

// Roll the count between old/new values instead of snapping.
let displayedCount = $state(untrack(() => controller.likeCount));
let previousCount = $state(untrack(() => controller.likeCount));
let rollUp = $state(true);
let rolling = $state(false);

$effect(() => {
	const next = controller.likeCount;
	if (next !== displayedCount) {
		previousCount = displayedCount;
		rollUp = next > displayedCount;
		displayedCount = next;
		rolling = true;
	}
});
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
				<span
					class="reaction-count-roll"
					class:roll-up={rolling && rollUp}
					class:roll-down={rolling && !rollUp}
					onanimationend={() => (rolling = false)}
				>
					{#if rolling}
						<span class="reaction-count-roll-old">{previousCount}</span>
					{/if}
					<span class="reaction-count-roll-new">{displayedCount}</span>
				</span>
			</button>
		{:else}
			<span class="reaction-count-static" class:has-count={detail && displayedCount > 0}>
				{#if displayedCount > 0 || rolling}
					<span
						class="reaction-count-roll"
						class:roll-up={rolling && rollUp}
						class:roll-down={rolling && !rollUp}
						onanimationend={() => (rolling = false)}
					>
						{#if rolling}
							<span class="reaction-count-roll-old">{previousCount > 0 ? previousCount : ''}</span>
						{/if}
						<span class="reaction-count-roll-new">{displayedCount > 0 ? displayedCount : ''}</span>
					</span>
				{/if}
			</span>
		{/if}
		<form method="POST" action="?/like" use:enhance={controller.handleLike}>
			<input type="hidden" name="post_id" value={controller.post.id}>
			<button
				type="submit"
				class="post-action-btn post-like-btn reaction-icon-hitbox"
				class:active={controller.likedByMe}
				class:popping
				class:pressed
				onpointerdown={onPointerDown}
				onpointercancel={() => (pressed = false)}
				onclick={onLikeClick}
				onanimationend={() => (popping = false)}
				aria-pressed={controller.likedByMe}
				disabled={!controller.isLoggedIn}
				aria-label={label}
				title={label}
			>
				<svg
					width="17"
					height="17"
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
