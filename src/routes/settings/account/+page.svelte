<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let username = $state(untrack(() => data.profile?.username ?? ""));
let saving = $state(false);
let savingPassword = $state(false);
let passwordSet = $state(false);

const submitUsername: SubmitFunction = () => {
	saving = true;
	return async ({ result, update }) => {
		saving = false;
		await update({ reset: false });
		if (result.type === "success" && data.profile) {
			username = data.profile.username;
		}
	};
};

const submitPassword: SubmitFunction = () => {
	savingPassword = true;
	return async ({ result, update }) => {
		savingPassword = false;
		await update({ reset: true });
		if (result.type === "success") passwordSet = true;
	};
};
</script>

<svelte:head> <title>アカウント - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">アカウント</h1>
				<a href="/settings" class="btn btn-ghost">設定</a>
			</div>

			{#if form?.success && (!('action' in form) || form.action === 'updateUsername')}
				<div class="flash-success">ユーザー名を更新しました。</div>
			{/if}

			{#if form && 'message' in form && !('field' in form) && (!('action' in form) || form.action === 'updateUsername')}
				<div class="flash-error">{form.message}</div>
			{/if}

			{#if !data.hasEmailProvider && !passwordSet}
				<section class="settings-section">
					<h2 class="settings-section-title">パスワードを設定</h2>
					<p class="field-hint" style="margin-bottom: 14px;">
						Googleアカウントにパスワードを設定すると、メールアドレスとパスワードでもログインできるようになります。
					</p>

					{#if form?.success && 'action' in form && form.action === 'setPassword'}
						<div class="flash-success">
							パスワードを設定しました。次回からメールアドレスとパスワードでもログインできます。
						</div>
					{/if}

					{#if form && 'message' in form && 'action' in form && form.action === 'setPassword' && !form.success}
						<div class="flash-error">{form.message}</div>
					{/if}

					<form method="POST" action="?/setPassword" use:enhance={submitPassword}>
						<div class="field">
							<label for="set-password" class="field-label">新しいパスワード</label>
							<input
								id="set-password"
								name="password"
								type="password"
								class="field-input"
								class:field-error={form && 'field' in form && 'action' in form && form.action === 'setPassword' && form.field === 'password'}
								autocomplete="new-password"
								minlength="6"
								required
							>
							{#if form && 'field' in form && 'action' in form && form.action === 'setPassword' && form.field === 'password'}
								<p class="field-error-msg">{form.message}</p>
							{:else}
								<p class="field-hint">6文字以上で入力してください。</p>
							{/if}
						</div>
						<div class="field">
							<label for="set-password-confirm" class="field-label">パスワード（確認）</label>
							<input
								id="set-password-confirm"
								name="confirm"
								type="password"
								class="field-input"
								class:field-error={form && 'field' in form && 'action' in form && form.action === 'setPassword' && form.field === 'confirm'}
								autocomplete="new-password"
								minlength="6"
								required
							>
							{#if form && 'field' in form && 'action' in form && form.action === 'setPassword' && form.field === 'confirm'}
								<p class="field-error-msg">{form.message}</p>
							{/if}
						</div>
						<div class="settings-actions">
							<button type="submit" class="btn btn-primary" disabled={savingPassword}>
								{savingPassword ? '設定中...' : 'パスワードを設定'}
							</button>
						</div>
					</form>
				</section>

				<hr class="settings-divider">
			{/if}

			<form method="POST" action="?/updateUsername" use:enhance={submitUsername}>
				<div class="field">
					<label for="username" class="field-label">
						ユーザー名 <span class="field-required">必須</span>
					</label>
					<div class="field-input-prefix">
						<span class="prefix">@</span>
						<input
							id="username"
							name="username"
							type="text"
							class="field-input has-prefix"
							class:field-error={form && 'field' in form && form.field === 'username'}
							placeholder="animetaro"
							maxlength="20"
							pattern={"[a-zA-Z0-9_]{3,20}"}
							required
							bind:value={username}
						>
					</div>
					{#if form && 'field' in form && form.field === 'username'}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">3〜20文字の半角英数字・アンダースコアのみ使用できます。</p>
					{/if}
				</div>

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? '保存中...' : 'ユーザー名を保存'}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>

<style>
.settings-section {
	padding-top: 18px;
	margin-top: 18px;
	border-top: 1px solid var(--border, #334155);
}

.settings-section-title {
	margin: 0 0 8px;
	font-size: 1rem;
	font-weight: 700;
}

.settings-divider {
	border: none;
	border-top: 1px solid var(--border, #334155);
	margin: 22px 0 0;
}
</style>
