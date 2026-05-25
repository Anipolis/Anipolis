<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { form }: PageProps = $props();

let saving = $state(false);

const submitPassword: SubmitFunction = () => {
	saving = true;
	return async ({ update }) => {
		saving = false;
		await update({ reset: true });
	};
};
</script>

<svelte:head><title>パスワードの設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">パスワードの設定</h1>
				<a href="/settings" class="btn btn-ghost">設定</a>
			</div>

			{#if form?.success}
				<div class="flash-success">
					パスワードを設定しました。次回からメールアドレスとパスワードでもログインできます。
				</div>
			{/if}

			{#if form && "message" in form && !form.success && !("field" in form)}
				<div class="flash-error">{form.message}</div>
			{/if}

			<p class="field-hint" style="margin: 16px 0 20px;">
				Googleアカウントにパスワードを設定すると、メールアドレスとパスワードでもログインできるようになります。
			</p>

			<form method="POST" action="?/setPassword" use:enhance={submitPassword}>
				<div class="field">
					<label for="set-password" class="field-label">新しいパスワード</label>
					<input
						id="set-password"
						name="password"
						type="password"
						class="field-input"
						class:field-error={form && "field" in form && form.field === "password"}
						autocomplete="new-password"
						minlength="6"
						required
					>
					{#if form && "field" in form && form.field === "password"}
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
						class:field-error={form && "field" in form && form.field === "confirm"}
						autocomplete="new-password"
						minlength="6"
						required
					>
					{#if form && "field" in form && form.field === "confirm"}
						<p class="field-error-msg">{form.message}</p>
					{/if}
				</div>

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? "設定中..." : "パスワードを設定"}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>
