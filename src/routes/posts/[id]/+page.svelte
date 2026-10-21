<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { page } from "$app/state";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import PostDetail from "$lib/components/PostDetail.svelte";
import PostRow from "$lib/components/PostRow.svelte";
import { classifyComposerSubmitResult } from "$lib/components/post-composer-submit";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { createLatestResolved } from "$lib/latest-resolved.svelte";
import { charCountClass } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const MAX_LENGTH = 280;
let content = $state("");
let submitting = $state(false);
let replyError = $state<string | null>(null);
let pageTitle = $state("投稿 - Anipolis");

// data.enrichedData は deferred Promise。返信の送信・削除のあとの再取得で新しい Promise になっても、
// 解決するまでは前回のスレッドを表示し続ける（スケルトンは初回だけ、#296）。
// 別の投稿に移ったときは別のスレッドなので保持しない
const thread = createLatestResolved(
	() => data.enrichedData,
	() => page.params["id"] ?? "",
);

const remaining = $derived(MAX_LENGTH - content.length);
const countClass = $derived(charCountClass(content.length, MAX_LENGTH));
const canSubmit = $derived(content.trim().length > 0 && content.length <= MAX_LENGTH && !submitting);

const handleReply: SubmitFunction = () => {
	submitting = true;
	replyError = null;
	return async ({ result, update }) => {
		submitting = false;
		const outcome = classifyComposerSubmitResult(result);
		if (outcome.kind === "retry") {
			// failure / error では書きかけの返信を残し、理由を出して再送できるようにする。
			// update() は呼ばない: error 結果の既定処理はエラーページの描画で、返信が消える（#296）
			replyError = outcome.message;
			return;
		}
		if (outcome.kind === "success") content = "";
		await update();
	};
};

// スレッドが読めたら、投稿者の名前をタイトルに入れる（読めなかったときは既定のまま）
$effect(() => {
	const post = thread.value?.post as { display_name?: string | null; username?: string | null } | undefined;
	const name = post?.display_name || post?.username;
	if (name) pageTitle = `${name}の投稿 - Anipolis`;
});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta property="og:title" content={pageTitle}>
	<meta property="og:description" content={data.post.content.slice(0, 120)}>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if data.ogImageUrl}
		<meta property="og:image" content={data.ogImageUrl}>
		<meta name="twitter:card" content="summary_large_image">
	{/if}
</svelte:head>

<div class="page-container">
	<main class="feed-column">
		<a href="/" class="post-detail-back" aria-label="タイムラインに戻る">
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
		</a>

		{#if thread.value === null && thread.error}
			<div class="empty-state" role="alert">
				<p>投稿を読み込めませんでした</p>
				<button type="button" class="btn" onclick={() => location.reload()}>再読み込み</button>
			</div>
		{:else if thread.value === null}
			<div class="posts-loading-spinner" aria-label="読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: 3 } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:else}
			{@const enriched = thread.value}
			<!-- 親投稿（このポストがリプライの場合） -->
			{#if enriched.parentPost}
				<div class="thread-parent">
					<PostRow post={enriched.parentPost} currentUserId={data.currentUserId} />
					<div class="thread-line"></div>
				</div>
			{/if}

			<!-- メイン投稿 -->
			<div class="thread-main">
				<PostDetail post={enriched.post} currentUserId={data.currentUserId} />
			</div>

			<!-- リプライ入力フォーム -->
			{#if data.profile}
				<div class="reply-composer">
					<UserAvatar
						src={data.profile.avatar_url}
						username={data.profile.display_name || data.profile.username}
						size="md"
					/>
					<form method="POST" action="?/reply" use:enhance={handleReply} style="flex: 1;">
						<div class="reply-hint">@{enriched.post?.username} に返信</div>

						{#if replyError}
							<p class="flash-error" role="alert" style="margin-bottom: 8px;">{replyError}</p>
						{:else if form && 'message' in form}
							<p class="flash-error" role="alert" style="margin-bottom: 8px;">{form.message}</p>
						{/if}

						<textarea
							name="content"
							class="composer-textarea"
							placeholder="返信を入力…"
							rows="3"
							bind:value={content}
							maxlength={MAX_LENGTH + 10}
						></textarea>
						<div class="composer-footer">
							<span class="char-count {countClass}">{remaining}</span>
							<button type="submit" class="btn btn-primary" disabled={!canSubmit}>
								{submitting ? '投稿中…' : '返信'}
							</button>
						</div>
					</form>
				</div>
			{:else if data.session}
				<div class="auth-gate">
					<p>返信するには<a href="/settings">設定</a>を確認してください</p>
				</div>
			{:else}
				<div class="auth-gate">
					<p>返信するにはログインが必要です</p>
					<a href={`/auth?next=${encodeURIComponent(page.url.pathname)}`} class="btn btn-primary"
						>ログインして返信する</a
					>
				</div>
			{/if}

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
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>
