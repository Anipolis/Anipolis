<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let saving = $state(false);
let showCurrentPassword = $state(false);
let showNewPassword = $state(false);
let showConfirmPassword = $state(false);
const title = $derived(data.hasEmailProvider ? "パスワードの変更" : "パスワードの設定");

const submitPassword: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: true });
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
				<div class="flash-error">{form.message}</div>
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

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? (data.hasEmailProvider ? "変更中..." : "設定中...") : data.hasEmailProvider ? "パスワードを変更" : "パスワードを設定"}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>
