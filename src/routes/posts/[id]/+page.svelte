<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import PostCard from "$lib/components/PostCard.svelte";
import PostCardSkeleton from "$lib/components/PostCardSkeleton.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { charCountClass } from "$lib/utils/format";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const MAX_LENGTH = 280;
let content = $state("");
let submitting = $state(false);

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
</script>

<svelte:head> <title>投稿 — Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 600px; min-width: 0;">
		{#await data.enrichedData}
			<div class="posts-loading-spinner" aria-label="読み込み中">
				<div class="spinner" aria-hidden="true"></div>
				<span>読み込み中…</span>
			</div>
			{#each { length: 3 } as _, i (i)}
				<PostCardSkeleton />
			{/each}
		{:then enriched}
			<svelte:head> <title>{enriched.post?.display_name || enriched.post?.username || ''}の投稿 — Anipolis</title> </svelte:head>

			<!-- 親投稿（このポストがリプライの場合） -->
			{#if enriched.parentPost}
				<div class="thread-parent">
					<PostCard post={enriched.parentPost} currentUserId={data.currentUserId} />
					<div class="thread-line"></div>
				</div>
			{/if}

			<!-- メイン投稿 -->
			<div class="thread-main"><PostCard post={enriched.post} currentUserId={data.currentUserId} isDetailView /></div>

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
</div>
