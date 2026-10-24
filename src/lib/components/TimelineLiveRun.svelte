<script lang="ts">
import { comparePostsAsc } from "$lib/room-live-sync";
import type { Post } from "$lib/types";
import type { PostRoomContext } from "$lib/utils/post-presentation";
import PostRow from "./PostRow.svelte";

/**
 * タイムラインで、同じ人の同じルームへの実況が続いたまとまり（groupLiveRuns）。
 * タイムラインは新しい順だが、まとまりの中は話数ルームと同じ時系列順（上が古い）にして実況として読めるようにする。
 * 最初の 1 件（いちばん古い投稿）だけを出してたたみ、開くと続きを Discord のように下へ続けて出す
 */
interface Props {
	posts: Post[];
	room: PostRoomContext | null;
	currentUserId?: string | null;
}
let { posts, room, currentUserId = null }: Props = $props();
let expanded = $state(false);
// 一度でも開いたか。開くまでは続きの行を作らない
let opened = $state(false);
// タイムラインの並び（新しい順）に関係なく、投稿時刻の古い順に並べる
const chronological = $derived([...posts].sort(comparePostsAsc));
const first = $derived(chronological[0] as Post);
const rest = $derived(chronological.slice(1));
// 左端の時刻（21:03、ホバー・フォーカス時だけ出る）は当日の実況を追うためのもの。いちばん新しい投稿から 1 日過ぎたまとまりでは出さない
const recent = $derived(Date.now() - Date.parse((chronological.at(-1) ?? first).created_at) < 24 * 60 * 60 * 1000);
</script>

<div class="live-run">
	<!-- 開いたときは、最初の投稿も「○分前」に加えて左端に時刻を出し、続きの行とそろえる -->
	<PostRow post={first} {currentUserId} joinNext gutterTime={expanded && recent} />
	<!-- 一度開いたら、たたんでも行を破棄せず隠すだけにする。破棄すると続きの行でのいいね・リポスト・ブックマークの結果が開き直したときに消える -->
	{#if opened}
		<div hidden={!expanded}>
			{#each rest as post (post.id)}
				<!-- ルームは最初の行に出ているので、続きの行では出さない -->
				<PostRow {post} {currentUserId} joinPrevious joinNext insideRoom gutterTime={recent} />
			{/each}
		</div>
	{/if}
	<div class="live-run-bar">
		<button
			type="button"
			class="live-run-toggle"
			aria-expanded={expanded}
			onclick={() => {
				expanded = !expanded;
				opened = true;
			}}
		>
			<span class={expanded ? "i-lucide-chevron-up" : "i-lucide-chevron-down"} aria-hidden="true"></span>
			<span>{expanded ? "たたむ" : `続きの実況 ${rest.length} 件`}</span>
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
	margin-left: auto;
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
