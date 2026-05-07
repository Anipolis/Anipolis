<script lang="ts">
import type { Post } from "$lib/types/post";

interface Props {
	post: Post;
}

let { post }: Props = $props();

let liked = $state(false);
let reposted = $state(false);
let showRepostMenu = $state(false);
let showQuoteModal = $state(false);
let quoteText = $state('');
const likeCount = $derived(post.likes + (liked ? 1 : 0));
const repostCount = $derived(post.reposts + (reposted ? 1 : 0));

function formatTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / (1000 * 60));

	if (diffMinutes < 1) return "たった今";
	if (diffMinutes < 60) return `${diffMinutes}分前`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}時間前`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays}日前`;
	return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function toggleLike() {
	liked = !liked;
}

function openRepostMenu() {
	showRepostMenu = !showRepostMenu;
}

function handleRepost() {
	reposted = !reposted;
	showRepostMenu = false;
}

function handleQuoteRepost() {
	showRepostMenu = false;
	showQuoteModal = true;
}

function submitQuoteRepost() {
	if (quoteText.trim()) {
		reposted = true;
		quoteText = '';
		showQuoteModal = false;
	}
}

function closeQuoteModal() {
	showQuoteModal = false;
	quoteText = '';
}
</script>

<article class="border-y border-[var(--color-border)] px-4 py-3 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]">
	<div class="flex gap-3">
		<!-- User Icon -->
		<img src={post.user.icon} alt={post.user.name} class="h-12 w-12 shrink-0 rounded-full bg-[var(--color-border)]">

		<div class="min-w-0 flex-1">
			<!-- Header: Username + Time -->
			<div class="flex items-center gap-2">
				<span class="truncate font-bold text-[var(--color-text)]">{post.user.name}</span>
				<time class="shrink-0 text-sm text-[var(--color-text-muted)]">{formatTime(post.postedAt)}</time>
			</div>

			<!-- Content -->
			<p class="mt-1 whitespace-pre-wrap text-[var(--color-text)]">{post.content}</p>

			<!-- Hashtags -->
			{#if post.hashtags.length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each post.hashtags as hashtag}
						<span class="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] hover:underline"># {hashtag}</span>
					{/each}
				</div>
			{/if}

			<!-- Related Anime -->
			{#if post.relatedAnime}
				<a
					href="/anime/{post.relatedAnime.id}"
					class="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-muted)] px-3 py-1 text-sm text-[var(--color-accent)] no-underline transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent-hover)]"
				>
					<span class="i-lucide-tv h-3.5 w-3.5"></span>
					{post.relatedAnime.title}
				</a>
			{/if}

			<!-- Actions -->
			<div class="flex mt-4 items-center gap-4 text-[var(--color-text-muted)]">
				<!-- Like -->
				<button
					type="button"
					onclick={toggleLike}
					aria-label={liked ? "Unlike" : "Like"}
					class="flex h-8 w-8 border-none bg-transparent cursor-pointer transition-colors {liked
                        ? 'text-[var(--color-danger)]'
                        : 'hover:text-[var(--color-danger)]'}"
				>
					<span class="i-lucide-heart h-full w-full {liked ? 'fill-current' : ''}"></span>
					{#if likeCount > 0}<span class="text-xs ml-1">{likeCount}</span>{/if}
				</button>

				<!-- Repost -->
				<div class="relative">
					<button
						type="button"
						onclick={openRepostMenu}
						aria-label={reposted ? "Undo repost" : "Repost"}
						class="flex items-center gap-1 border-none bg-transparent cursor-pointer transition-colors {reposted
                            ? 'text-[var(--status-watching)]'
                            : 'hover:text-[var(--status-watching)]'}"
					>
						<span class="i-lucide-repeat h-5 w-5 {reposted ? 'fill-current' : ''}"></span>
						{#if repostCount > 0}<span class="text-xs">{repostCount}</span>{/if}
					</button>

					{#if showRepostMenu}
						<div class="absolute bottom-8 left-0 z-20 min-w-40 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
							<button
								type="button"
								onclick={handleRepost}
								class="flex w-full items-center gap-3 px-4 py-3 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
							>
								<span class="i-lucide-repeat h-4 w-4 text-[var(--status-watching)]"></span>
								{reposted ? 'リポストを取り消す' : 'リポスト'}
							</button>
							<button
								type="button"
								onclick={handleQuoteRepost}
								class="flex w-full items-center gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
							>
								<span class="i-lucide-pencil h-4 w-4 text-[var(--color-accent)]"></span>
								引用リポスト
							</button>
						</div>
						<!-- backdrop to close menu -->
						<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
						<div class="fixed inset-0 z-10" role="presentation" onclick={() => showRepostMenu = false}></div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</article>

{#if showQuoteModal}
	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onclick={closeQuoteModal}>
		<div class="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="quote-modal-title" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
				<h2 id="quote-modal-title" class="font-bold text-[var(--color-text)]">引用リポスト</h2>
				<button type="button" aria-label="閉じる" onclick={closeQuoteModal} class="rounded-full p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]">
					<span class="i-lucide-x h-5 w-5"></span>
				</button>
			</div>
			<div class="p-4">
				<textarea
					bind:value={quoteText}
					placeholder="コメントを追加..."
					rows="3"
					class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
				></textarea>
				<!-- quoted post preview -->
				<div class="mt-2 rounded-xl border border-[var(--color-border)] p-3">
					<div class="mb-1.5 flex items-center gap-2">
						<img src={post.user.icon} alt={post.user.name} class="h-5 w-5 rounded-full bg-[var(--color-border)]">
						<span class="text-xs font-bold text-[var(--color-text)]">{post.user.name}</span>
					</div>
					<p class="line-clamp-3 text-sm text-[var(--color-text-secondary)]">{post.content}</p>
				</div>
			</div>
			<div class="flex justify-end border-t border-[var(--color-border)] px-4 py-3">
				<button
					type="button"
					onclick={submitQuoteRepost}
					disabled={!quoteText.trim()}
					class="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
				>
					リポスト
				</button>
			</div>
		</div>
	</div>
{/if}
