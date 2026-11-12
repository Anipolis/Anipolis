<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { charCountClass } from "$lib/utils/format";
import { classifyComposerSubmitResult } from "./post-composer-submit";
import UserAvatar from "./UserAvatar.svelte";

interface Props {
	/** 返信を送るフォームの action（例: "?/reply"）*/
	action: string;
	/** 返信先のユーザー名（@ を付けずに渡す）*/
	replyTo: string | undefined;
	/** ログイン中のプロフィール。無ければ返信できない案内を出す */
	profile: { avatar_url: string | null; display_name: string | null; username: string } | null | undefined;
	/** プロフィールは無いがログインはしている（設定の確認待ち）*/
	hasSession: boolean;
	/** 未ログインのときにログイン後に戻すパス */
	loginNext: string;
	/** サーバーが返した失敗の理由（フォーム結果として届いたもの）*/
	serverMessage?: string | null;
	/**
	 * 送信が終わったあとの処理。update は SvelteKit の既定の後処理（load の再実行）で、
	 * 呼ぶかどうかは使う側が決める
	 */
	onsettled: (update: () => Promise<void>) => Promise<void> | void;
}

let { action, replyTo, profile, hasSession, loginNext, serverMessage = null, onsettled }: Props = $props();

const MAX_LENGTH = 280;
let content = $state("");
let submitting = $state(false);
let replyError = $state<string | null>(null);

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
		await onsettled(() => update());
	};
};
</script>

{#if profile}
	<div class="reply-composer">
		<UserAvatar src={profile.avatar_url} username={profile.display_name || profile.username} size="md" />
		<form method="POST" {action} use:enhance={handleReply} style="flex: 1;">
			<div class="reply-hint">@{replyTo} に返信</div>

			{#if replyError}
				<p class="flash-error" role="alert" style="margin-bottom: 8px;">{replyError}</p>
			{:else if serverMessage}
				<p class="flash-error" role="alert" style="margin-bottom: 8px;">{serverMessage}</p>
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
					{submitting ? "投稿中…" : "返信"}
				</button>
			</div>
		</form>
	</div>
{:else if hasSession}
	<div class="auth-gate">
		<p>返信するには<a href="/settings">設定</a>を確認してください</p>
	</div>
{:else}
	<div class="auth-gate">
		<p>返信するにはログインが必要です</p>
		<a href={`/auth?next=${encodeURIComponent(loginNext)}`} class="btn btn-primary">ログインして返信する</a>
	</div>
{/if}
