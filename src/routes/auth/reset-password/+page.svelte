<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import { FORGOT_PASSWORD_PATH } from "$lib/utils/password-reset";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let saving = $state(false);
let showNewPassword = $state(false);
let showConfirmPassword = $state(false);

const submitPassword: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: true });
	};
};
</script>

<svelte:head><title>新しいパスワードの設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 520px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">新しいパスワードの設定</h1>
			</div>

			{#if form?.success}
				<div class="flash-success">パスワードを再設定しました。新しいパスワードでログインできます。</div>
				<a href="/" class="btn btn-primary auth-wide-button">Anipolisへ</a>
			{:else if data.state === 'oauth_only'}
				<div class="flash-error" role="alert">このメールアドレスのアカウントはパスワードを持っていません。</div>
				<p class="auth-info-text">
					{#if data.providers.length > 0}
						{data.providers.join(' / ')}
						でのログインに使われています。ログイン画面で同じサービスのボタンからログインしてください。
					{:else}
						ログイン画面から外部サービスのボタンでログインしてください。
					{/if}
				</p>
				<a href="/auth?mode=login" class="btn btn-primary auth-wide-button">ログイン画面へ</a>
			{:else if data.state !== 'ready'}
				<div class="flash-error" role="alert">
					{#if data.state === 'expired'}
						再設定リンクの有効期限が切れています。
					{:else if data.state === 'invalid'}
						再設定リンクが無効です。すでに使用済みか、申請したときと別のブラウザで開いている可能性があります。
					{:else}
						再設定の手続きが確認できませんでした。リンクの有効期限切れ、または設定済みのリンクを再度開いた可能性があります。
					{/if}
				</div>
				<p class="auth-info-text">
					お手数ですが、もう一度メールアドレスを入力して再設定メールを受け取ってください。
				</p>
				<a href={FORGOT_PASSWORD_PATH} class="btn btn-primary auth-wide-button">再設定メールを申請する</a>
			{:else}
				{#if form && 'message' in form && !('field' in form)}
					<div class="flash-error" role="alert">{form.message}</div>
				{/if}

				{#if data.email}
					<p class="auth-info-text"><strong>{data.email}</strong> の新しいパスワードを入力してください。</p>
				{/if}

				<form method="POST" action="?/setPassword" class="auth-form" use:enhance={submitPassword}>
					<div class="field">
						<label for="reset-password" class="field-label">新しいパスワード</label>
						<div class="password-input-wrap">
							<input
								id="reset-password"
								name="password"
								type={showNewPassword ? 'text' : 'password'}
								class="field-input password-input"
								class:field-error={form && 'field' in form && form.field === 'password'}
								autocomplete="new-password"
								minlength="6"
								required
							>
							<button
								type="button"
								class="password-toggle"
								aria-label={showNewPassword ? 'パスワードを隠す' : 'パスワードを表示'}
								title={showNewPassword ? 'パスワードを隠す' : 'パスワードを表示'}
								onclick={() => {
									showNewPassword = !showNewPassword;
								}}
							>
								{#if showNewPassword}
									<span class="i-lucide-eye-off" aria-hidden="true"></span>
								{:else}
									<span class="i-lucide-eye" aria-hidden="true"></span>
								{/if}
							</button>
						</div>
						{#if form && 'field' in form && form.field === 'password'}
							<p class="field-error-msg">{form.message}</p>
						{:else}
							<p class="field-hint">6文字以上で入力してください。</p>
						{/if}
					</div>

					<div class="field">
						<label for="reset-password-confirm" class="field-label">パスワード（確認）</label>
						<div class="password-input-wrap">
							<input
								id="reset-password-confirm"
								name="confirm"
								type={showConfirmPassword ? 'text' : 'password'}
								class="field-input password-input"
								class:field-error={form && 'field' in form && form.field === 'confirm'}
								autocomplete="new-password"
								minlength="6"
								required
							>
							<button
								type="button"
								class="password-toggle"
								aria-label={showConfirmPassword ? 'パスワードを隠す' : 'パスワードを表示'}
								title={showConfirmPassword ? 'パスワードを隠す' : 'パスワードを表示'}
								onclick={() => {
									showConfirmPassword = !showConfirmPassword;
								}}
							>
								{#if showConfirmPassword}
									<span class="i-lucide-eye-off" aria-hidden="true"></span>
								{:else}
									<span class="i-lucide-eye" aria-hidden="true"></span>
								{/if}
							</button>
						</div>
						{#if form && 'field' in form && form.field === 'confirm'}
							<p class="field-error-msg">{form.message}</p>
						{/if}
					</div>

					<button type="submit" class="btn btn-primary auth-wide-button" disabled={saving}>
						{saving ? '設定中...' : 'パスワードを再設定'}
					</button>
				</form>
			{/if}
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
	text-align: center;
}

.auth-info-text {
	color: var(--fg-muted);
	font-size: 0.88rem;
	margin: 12px 0 18px;
}
</style>
