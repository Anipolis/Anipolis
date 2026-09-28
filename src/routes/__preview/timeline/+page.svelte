<script lang="ts">
import { onMount } from "svelte";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import PostComposer from "$lib/components/PostComposer.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import type { LiveRoomData } from "$lib/types/live-room";
import { isPostContinuation } from "$lib/utils/post-presentation";

let posts = $state(makeTimelinePosts());
let room = $state(false);
let dark = $state(false);
let submitted = $state(0);
const channel = {
	on() {
		return this;
	},
	subscribe() {
		return this;
	},
};
const roomData = $derived({
	supabase: { channel: () => channel, removeChannel: async () => "ok" } as unknown as LiveRoomData["supabase"],
	anime: null,
	room: {
		session_id: "preview-room",
		date: "2026-09-08",
		kind: "global",
		hashtag: "星をめぐる旅",
		scheduled_at: "2026-09-08T12:00:00Z",
		posting_opens_at: "2020-01-01T00:00:00Z",
		posting_closes_at: "2099-01-01T00:00:00Z",
		duration_minutes: null,
		title: "星をめぐる旅 / 第7話",
	},
	posts,
	trending: [],
	animeTrending: [],
	user: {
		id: "preview-user-0",
		app_metadata: {},
		user_metadata: {},
		aud: "authenticated",
		created_at: "2026-09-08T00:00:00Z",
	},
	roomExperiment: { enabled: false },
	roomExitSurvey: { experimentRunId: null, alreadyAnswered: false, postCount: 0, surveyVersion: "preview" },
} satisfies LiveRoomData);

function addPost() {
	const post = makeTimelinePosts(1)[0];
	if (post)
		posts = [
			...posts,
			{
				...post,
				id: `preview-${posts.length}`,
				content: "新着のリアクション！",
				created_at: new Date().toISOString(),
			},
		];
}

onMount(() => {
	const originalTheme = document.documentElement.getAttribute("data-theme");
	const originalFetch = window.fetch;
	window.fetch = (input, init) => {
		const url = String(input);
		if (url.startsWith("/api/rooms/posts") || url.startsWith("/api/posts/preview-"))
			return Promise.resolve(Response.json({ posts: [], replies: [] }));
		return originalFetch(input, init);
	};
	function interceptSubmit(event: SubmitEvent) {
		event.preventDefault();
		event.stopImmediatePropagation();
		submitted += 1;
	}
	document.addEventListener("submit", interceptSubmit, true);
	return () => {
		window.fetch = originalFetch;
		document.removeEventListener("submit", interceptSubmit, true);
		if (originalTheme) document.documentElement.setAttribute("data-theme", originalTheme);
		else document.documentElement.removeAttribute("data-theme");
	};
});

$effect(() => {
	document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
});
</script>

<svelte:head
	><title>投稿UIの確認 — Anipolis</title>
	<meta name="robots" content="noindex"></svelte:head
>
<div class="preview-controls">
	<span>開発用 · 40件の混在投稿</span>
	<button type="button" onclick={() => room = !room}>{room ? "ホーム表示へ" : "実況表示へ"}</button>
	<button type="button" onclick={() => dark = !dark}>{dark ? "ライト表示" : "ダーク表示"}</button>
	<button type="button" onclick={addPost}>新着を追加</button>
	<span>送信確認: {submitted}</span>
</div>
{#if room}
	<LiveRoomView data={roomData} form={null} />
{:else}
	<div class="page-container">
		<div class="feed-column">
			<PostComposer username="viewer_0" avatarUrl={null} />
			{#each posts as post, index (post.id)}
				<PostRow
					{post}
					currentUserId="preview-user-0"
					continuation={isPostContinuation(post, posts[index - 1])}
				/>
			{/each}
		</div>
		<aside class="sidebar-column">
			<TrendingPanel
				trending={[{ name: "星をめぐる旅", post_count: 128 }, { name: "今週のアニメ", post_count: 64 }]}
			/>
		</aside>
	</div>
{/if}

<style>
.preview-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 8px 16px;
	border-bottom: 1px solid var(--color-border);
	font-size: 12px;
}
.preview-controls button {
	padding: 6px 10px;
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
	cursor: pointer;
}
:global(.room-page-container) {
	height: calc(100dvh - 74px);
}
</style>
