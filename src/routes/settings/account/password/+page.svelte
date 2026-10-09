<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let saving = $state(false);
let sendingCode = $state(false);
let showCurrentPassword = $state(false);
let showNewPassword = $state(false);
let showConfirmPassword = $state(false);
const title = $derived(data.hasEmailProvider ? "パスワードの変更" : "パスワードの設定");
// Auth が再認証（確認コード）を要求したか、コードを送信済みなら nonce の入力欄を出す（#234）
const nonceRequired = $derived(
	!!form &&
		(("reauthRequired" in form && form.reauthRequired === true) ||
			("reauthSent" in form && form.reauthSent === true)),
);

const submitPassword: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: true });
	};
};

const submitRequestReauth: SubmitFunction = () => {
	sendingCode = true;
	return async ({ update }) => {
		sendingCode = false;
		await update({ reset: false });
	};
};
</script>

<svelte:head><title>{title} - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">{title}</h1>
			</div>

			{#if form?.success}
				<div class="flash-success">パスワードを保存しました。</div>
			{/if}

			{#if form && "message" in form && !form.success && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			{#if form && "reauthSent" in form && form.reauthSent}
				<div class="flash-success" role="status">
					確認コードをメールに送りました。届いたコードを下の欄に入力してください。
				</div>
			{/if}

			{#if !data.hasEmailProvider}
				<p class="field-hint" style="margin: 16px 0 20px;">
					Googleアカウントにパスワードを設定すると、メールアドレスとパスワードでもログインできるようになります。
				</p>
			{/if}

			<form method="POST" action="?/setPassword" use:enhance={submitPassword}>
				{#if data.hasEmailProvider}
					<div class="field">
						<label for="current-password" class="field-label">現在のパスワード</label>
						<div class="password-input-wrap">
							<input
								id="current-password"
								name="current_password"
								type={showCurrentPassword ? "text" : "password"}
								class="field-input password-input"
								class:field-error={form && "field" in form && form.field === "current_password"}
								autocomplete="current-password"
								required
							>
							<button
								type="button"
								class="password-toggle"
								aria-label={showCurrentPassword ? "パスワードを隠す" : "パスワードを表示"}
								title={showCurrentPassword ? "パスワードを隠す" : "パスワードを表示"}
								onclick={() => {
									showCurrentPassword = !showCurrentPassword;
								}}
							>
								{#if showCurrentPassword}
									<span class="i-lucide-eye-off" aria-hidden="true"></span>
								{:else}
									<span class="i-lucide-eye" aria-hidden="true"></span>
								{/if}
							</button>
						</div>
						{#if form && "field" in form && form.field === "current_password"}
							<p class="field-error-msg">{form.message}</p>
						{/if}
					</div>
				{/if}

				<div class="field">
					<label for="set-password" class="field-label">新しいパスワード</label>
					<div class="password-input-wrap">
						<input
							id="set-password"
							name="password"
							type={showNewPassword ? "text" : "password"}
							class="field-input password-input"
							class:field-error={form && "field" in form && form.field === "password"}
							autocomplete="new-password"
							minlength="6"
							required
						>
						<button
							type="button"
							class="password-toggle"
							aria-label={showNewPassword ? "パスワードを隠す" : "パスワードを表示"}
							title={showNewPassword ? "パスワードを隠す" : "パスワードを表示"}
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
					{#if form && "field" in form && form.field === "password"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">6文字以上で入力してください。</p>
					{/if}
				</div>

				<div class="field">
					<label for="set-password-confirm" class="field-label">パスワード（確認）</label>
					<div class="password-input-wrap">
						<input
							id="set-password-confirm"
							name="confirm"
							type={showConfirmPassword ? "text" : "password"}
							class="field-input password-input"
							class:field-error={form && "field" in form && form.field === "confirm"}
							autocomplete="new-password"
							minlength="6"
							required
						>
						<button
							type="button"
							class="password-toggle"
							aria-label={showConfirmPassword ? "パスワードを隠す" : "パスワードを表示"}
							title={showConfirmPassword ? "パスワードを隠す" : "パスワードを表示"}
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
					{#if form && "field" in form && form.field === "confirm"}
						<p class="field-error-msg">{form.message}</p>
					{/if}
				</div>

				{#if nonceRequired}
					<div class="field">
						<label for="reauth-nonce" class="field-label">確認コード</label>
						<input
							id="reauth-nonce"
							name="nonce"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							class="field-input"
							class:field-error={form && "field" in form && form.field === "nonce"}
							placeholder="メールで届いた6桁のコード"
						>
						{#if form && "field" in form && form.field === "nonce"}
							<p class="field-error-msg">{form.message}</p>
						{:else}
							<p class="field-hint">本人確認のため、登録メールアドレスに送った確認コードが必要です。</p>
						{/if}
					</div>
				{/if}

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? (data.hasEmailProvider ? "変更中..." : "設定中...") : data.hasEmailProvider ? "パスワードを変更" : "パスワードを設定"}
					</button>
				</div>
			</form>

			{#if nonceRequired}
				<form method="POST" action="?/requestReauth" use:enhance={submitRequestReauth} class="settings-actions">
					<button type="submit" class="btn btn-secondary" disabled={sendingCode}>
						{sendingCode ? "送信中..." : "確認コードをメールで送信"}
					</button>
				</form>
			{/if}
		</div>
	</main>
</div>
