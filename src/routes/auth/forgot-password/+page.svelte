<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { form }: PageProps = $props();

let sending = $state(false);

const submitRequest: SubmitFunction = () => {
	sending = true;
	return async ({ update }) => {
		sending = false;
		await update({ reset: true });
	};
};
</script>

<svelte:head><title>パスワードの再設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 520px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">パスワードの再設定</h1>
				<a href="/auth?mode=login" class="btn btn-ghost">ログインへ戻る</a>
			</div>

			{#if form?.success}
				<div class="flash-success">{form.message}</div>
			{:else if form && "message" in form}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<p class="auth-info-text">
				登録したメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。 Google・X・Discord
				でログインしているアカウントにはパスワードがないため、各サービスのボタンからログインしてください。
			</p>

			<form method="POST" action="?/request" class="auth-form" use:enhance={submitRequest}>
				<div class="field">
					<label for="forgot-email" class="field-label">メールアドレス</label>
					<input
						id="forgot-email"
						name="email"
						type="email"
						class="field-input"
						autocomplete="email"
						maxlength="254"
						value={form && !form.success ? form.email ?? "" : ""}
						required
					>
				</div>

				<button type="submit" class="btn btn-primary auth-wide-button" disabled={sending}>
					{sending ? "送信中..." : "再設定メールを送信"}
				</button>
			</form>
		</div>
	</main>
</div>

<style>
.auth-form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.auth-wide-button {
	width: 100%;
	justify-content: center;
}

.auth-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	margin: 12px 0 18px;
}
</style>
