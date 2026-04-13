<script lang="ts">
import type { Post } from "$lib/types/post";

interface Props {
	post: Post;
}

let { post }: Props = $props();

let liked = $state(false);
let reposted = $state(false);
let likeCount = $derived(post.likes + (liked ? 1 : 0));
let repostCount = $derived(post.reposts + (reposted ? 1 : 0));

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

function toggleRepost() {
	reposted = !reposted;
}
</script>

<article class="border-y border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50">
	<div class="flex gap-3">
		<!-- User Icon -->
		<img src={post.user.icon} alt={post.user.name} class="h-12 w-12 shrink-0 rounded-full bg-gray-100">

		<div class="min-w-0 flex-1">
			<!-- Header: Username + Time -->
			<div class="flex items-center gap-2">
				<span class="truncate font-bold text-gray-900">{post.user.name}</span>
				<time class="shrink-0 text-sm text-gray-400">{formatTime(post.postedAt)}</time>
			</div>

			<!-- Content -->
			<p class="mt-1 whitespace-pre-wrap text-gray-800">{post.content}</p>

			<!-- Hashtags -->
			{#if post.hashtags.length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each post.hashtags as hashtag}
						<span class="text-sm text-blue-500 hover:underline"># {hashtag}</span>
					{/each}
				</div>
			{/if}

			<!-- Related Anime -->
			<a
				href="/anime/{post.relatedAnime.id}"
				class="mt-2 inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-sm text-purple-600 no-underline transition-colors hover:bg-purple-100"
			>
				<span class="i-lucide-tv h-3.5 w-3.5"></span>
				{post.relatedAnime.title}
			</a>

			<!-- Actions -->
			<div class="flex mt-4 items-center gap-4 text-gray-400">
				<!-- Like -->
				<button
					type="button"
					onclick={toggleLike}
					aria-label={liked ? "Unlike" : "Like"}
					class="flex h-8 w-8 border-none bg-transparent cursor-pointer transition-colors {liked
                        ? 'text-red-500'
                        : 'hover:text-red-500'}"
				>
					<span class="i-lucide-heart h-full w-full {liked ? 'fill-current' : ''}"></span>
				</button>

				<!-- Repost -->
				<button
					type="button"
					onclick={toggleRepost}
					aria-label={reposted ? "Undo repost" : "Repost"}
					class="flex h-8 w-8 border-none bg-transparent cursor-pointer transition-colors {reposted
                        ? 'text-green-500'
                        : 'hover:text-green-500'}"
				>
					<span class="i-lucide-repeat h-full w-full {reposted ? 'fill-current' : ''}"></span>
				</button>
			</div>
		</div>
	</div>
</article>
