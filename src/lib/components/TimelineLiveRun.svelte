<script lang="ts">
import type { Post } from "$lib/types";
import type { PostRoomContext } from "$lib/utils/post-presentation";
import PostRow from "./PostRow.svelte";

/**
 * タイムラインで、同じ人の同じルームへの実況が続いたまとまり（groupLiveRuns）。
 * 最初の 1 件だけを出してたたみ、開くと残りを Discord のように続けて出す
 */
interface Props {
	posts: Post[];
	room: PostRoomContext | null;
	currentUserId?: string | null;
}
let { posts, room, currentUserId = null }: Props = $props();
let expanded = $state(false);
const first = $derived(posts[0] as Post);
const rest = $derived(posts.slice(1));
</script>

<div class="live-run">
	<PostRow post={first} {currentUserId} joinNext />
	{#if expanded}
		{#each rest as post (post.id)}
			<!-- ルームは最初の行に出ているので、続きの行では出さない -->
			<PostRow {post} {currentUserId} joinPrevious joinNext insideRoom />
		{/each}
	{/if}
	<div class="live-run-bar">
		<button type="button" class="live-run-toggle" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
			<span class={expanded ? "i-lucide-chevron-up" : "i-lucide-chevron-down"} aria-hidden="true"></span>
			<span>{expanded ? "たたむ" : `ほか ${rest.length} 件の実況`}</span>
		</button>
		{#if room}
			<a href={room.href} class="live-run-room" title={room.title}>
				<span class="i-lucide-door-open" aria-hidden="true"></span>
				<span class="live-run-room-label">ルームで見る</span>
			</a>
		{/if}
	</div>
</div>

<style>
.live-run-bar {
	display: flex;
	align-items: center;
	gap: 12px;
	/* PostRow の本文の左端（余白 12px + アイコン 28px + 間隔 10px）にそろえる */
	padding: 2px 12px 8px 50px;
	border-bottom: 1px solid var(--color-border);
}
.live-run-toggle,
.live-run-room {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-height: 28px;
	padding: 2px 8px;
	margin-left: -8px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 700;
	text-decoration: none;
	cursor: pointer;
}
.live-run-room {
	margin-left: 0;
	font-weight: 600;
}
.live-run-toggle:hover,
.live-run-room:hover {
	background: var(--color-surface-hover);
	color: var(--color-accent);
}
.live-run-toggle [class^="i-lucide"],
.live-run-room [class^="i-lucide"] {
	width: 14px;
	height: 14px;
}
@media (max-width: 640px) {
	.live-run-bar {
		padding-left: 46px;
		padding-right: 10px;
	}
}
</style>
