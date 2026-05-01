<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import PostCard from "$lib/components/PostCard.svelte";
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

const displayName = $derived(data.post.display_name || data.post.username);

const handleReply: SubmitFunction = () => {
	submitting = true;
	return async ({ update }) => {
		submitting = false;
		content = "";
		await update();
	};
};
</script>

<svelte:head> <title>{displayName}の投稿 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 600px; min-width: 0;">
		<!-- 親投稿（このポストがリプライの場合） -->
		{#if data.parentPost}
			<div class="thread-parent">
				<PostCard post={data.parentPost} currentUserId={data.currentUserId} />
				<div class="thread-line"></div>
			</div>
		{/if}

		<!-- メイン投稿 -->
		<div class="thread-main"><PostCard post={data.post} currentUserId={data.currentUserId} isDetailView /></div>

		<!-- リプライ入力フォーム -->
		{#if data.profile}
			<div class="reply-composer">
				<UserAvatar
					src={data.profile.avatar_url}
					username={data.profile.display_name || data.profile.username}
					size="md"
				/>
				<form method="POST" action="?/reply" use:enhance={handleReply} style="flex: 1;">
					<div class="reply-hint">@{data.post.username} に返信</div>

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
				<p>返信するには<a href="/settings/profile">プロフィールを設定</a>してください</p>
			</div>
		{:else}
			<div class="auth-gate">
				<p>返信するにはログインが必要です</p>
			</div>
		{/if}

		<!-- リプライ一覧 -->
		{#if data.replies.length > 0}
			<div class="replies-section">
				{#each data.replies as reply (reply.id)}
					<PostCard post={reply} currentUserId={data.currentUserId} />
				{/each}
			</div>
		{:else}
			<div class="empty-state" style="margin-top: 8px;">
				<p>まだ返信がありません</p>
			</div>
		{/if}
	</main>
</div>
