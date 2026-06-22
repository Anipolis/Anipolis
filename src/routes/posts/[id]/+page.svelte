<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { page } from "$app/state";
import PostCard from "$lib/components/PostCard.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import TrendingPanel from "$lib/components/TrendingPanel.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { charCountClass } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const MAX_LENGTH = 280;
let content = $state("");
let submitting = $state(false);
let pageTitle = $state("投稿 — Anipolis");

const remaining = $derived(MAX_LENGTH - content.length);
const countClass = $derived(charCountClass(content.length, MAX_LENGTH));
const canSubmit = $derived(content.trim().length > 0 && content.length <= MAX_LENGTH && !submitting);

const handleReply: SubmitFunction = () => {
	submitting = true;
	return async ({ result, update }) => {
		if (result.type === "success") {
			content = "";
		}
		submitting = false;
		await update();
	};
};

// Update title once data resolves
$effect(() => {
	const promise = data.enrichedData;
	promise.then((enriched: { post?: { display_name?: string | null; username?: string | null } }) => {
		const name = enriched.post?.display_name || enriched.post?.username;
		if (name) pageTitle = `${name}の投稿 — Anipolis`;
	});
});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta property="og:title" content={pageTitle}>
	<meta property="og:description" content={data.post.content.slice(0, 120)}>
	<meta property="og:type" content="website">
	<meta property="og:url" content={page.url.href}>
	{#if data.post.image_urls?.[0]}
		<meta property="og:image" content={data.post.image_urls[0]}>
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

		{#await data.enrichedData}
			<div class="posts-loading-spinner" aria-label="読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: 3 } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:then enriched}
			<!-- 親投稿（このポストがリプライの場合） -->
			{#if enriched.parentPost}
				<div class="thread-parent">
					<PostCard post={enriched.parentPost} currentUserId={data.currentUserId} />
					<div class="thread-line"></div>
				</div>
			{/if}

			<!-- メイン投稿 -->
			<div class="thread-main">
				<PostCard post={enriched.post} currentUserId={data.currentUserId} isDetailView />
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

						{#if form && 'message' in form}
							<p class="flash-error" style="margin-bottom: 8px;">{form.message}</p>
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
				</div>
			{/if}

			<!-- リプライ一覧 -->
			{#if enriched.replies.length > 0}
				<div class="replies-section">
					{#each enriched.replies as reply (reply.id)}
						<PostCard post={reply} currentUserId={data.currentUserId} />
					{/each}
				</div>
			{:else}
				<div class="empty-state" style="margin-top: 8px;">
					<p>まだ返信がありません</p>
				</div>
			{/if}
		{/await}
	</main>

	<aside class="sidebar-column">
		<TrendingPanel trending={data.trending} animeTrending={data.animeTrending} />
	</aside>
</div>
