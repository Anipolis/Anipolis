<script lang="ts">
import { untrack } from "svelte";
import { page } from "$app/state";
import BackLink from "$lib/components/BackLink.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostDetail from "$lib/components/PostDetail.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import ReplyComposer from "$lib/components/ReplyComposer.svelte";
import SeoMeta from "$lib/components/SeoMeta.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import { createLatestResolved } from "$lib/latest-resolved.svelte";
import { recallPostSeed } from "$lib/post-seed";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

// サーバーで決めた題名（投稿者の名前入り）で始め、スレッドが読めたら最新の名前に合わせる
let pageTitle = $state(untrack(() => data.meta.title));

// data.enrichedData は deferred Promise。返信の送信・削除のあとの再取得で新しい Promise になっても、
// 解決するまでは前回のスレッドを表示し続ける（スケルトンは初回だけ、#296）。
// 別の投稿に移ったときは別のスレッドなので保持しない
const thread = createLatestResolved(
	() => data.enrichedData,
	() => page.params["id"] ?? "",
);

// トレンドは本文と別にストリーミングで届く。届くまでは枠だけ空けておく
const sidebar = createLatestResolved(
	() => data.sidebar,
	() => page.params["id"] ?? "",
);

// スレッドが届くまでは、タイムラインなどで表示済みの本文を仮に出す（なければスケルトン）
const seed = $derived(recallPostSeed(page.params["id"] ?? ""));
const mainPost = $derived(thread.value?.post ?? seed);

// スレッドが読めたら、投稿者の名前をタイトルに入れる（読めなかったときは既定のまま）
$effect(() => {
	const post = thread.value?.post as { display_name?: string | null; username?: string | null } | undefined;
	const name = post?.display_name || post?.username;
	if (name) pageTitle = `${name}の投稿 - Anipolis`;
});
</script>

<SeoMeta
	title={pageTitle}
	description={data.meta.description}
	image={data.meta.image}
	card={data.meta.image ? "summary_large_image" : null}
	type="article"
/>

<div class="page-container">
	<main class="feed-column">
		<BackLink fallbackHref="/" class="post-detail-back">
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m15 18-6-6 6-6" />
			</svg>
		</BackLink>

		{#if thread.value === null && thread.error}
			<div class="empty-state" role="alert">
				<p>投稿を読み込めませんでした</p>
				<button type="button" class="btn" onclick={() => location.reload()}>再読み込み</button>
			</div>
		{:else}
			<!-- 親投稿（このポストがリプライの場合） -->
			{#if thread.value?.parentPost}
				<div class="thread-parent">
					<PostRow post={thread.value.parentPost} currentUserId={data.currentUserId} />
					<div class="thread-line"></div>
				</div>
			{/if}

			<!-- メイン投稿: スレッドが届く前は表示済みの本文を仮に出す。同じ位置に置き、届いても作り直さない -->
			{#if mainPost}
				<div class="thread-main">
					<PostDetail post={mainPost} currentUserId={data.currentUserId} />
				</div>
			{:else}
				<div class="posts-loading-spinner" role="status" aria-label="読み込み中">
					<div class="spinner" aria-hidden="true"></div>
					<span>読み込み中…</span>
				</div>
				{#each { length: 3 } as _, i (i)}
					<PostCardSkeleton />
				{/each}
			{/if}

			{#if thread.value === null && mainPost}
				<div class="posts-loading-spinner" role="status" aria-label="返信を読み込み中">
					<div class="spinner" aria-hidden="true"></div>
					<span>読み込み中…</span>
				</div>
				<PostCardSkeleton />
			{:else if thread.value}
				{@const enriched = thread.value}
				<!-- リプライ入力フォーム -->
				<ReplyComposer
					action="?/reply"
					replyTo={enriched.post?.username}
					profile={data.profile}
					hasSession={Boolean(data.session)}
					loginNext={page.url.pathname}
					serverMessage={form && "message" in form ? form.message : null}
					onsettled={(update) => update()}
				/>

				<!-- リプライ一覧 -->
				{#if enriched.replies.length > 0}
					<div class="replies-section">
						{#each enriched.replies as reply (reply.id)}
							<PostRow post={reply} currentUserId={data.currentUserId} />
						{/each}
					</div>
				{:else}
					<div class="empty-state" style="margin-top: 8px;">
						<p>まだ返信がありません</p>
					</div>
				{/if}
			{/if}
		{/if}
	</main>

	<aside class="sidebar-column">
		{#if sidebar.value}
			<TrendingPanel trending={sidebar.value.trending} animeTrending={sidebar.value.animeTrending} />
		{/if}
	</aside>
</div>
