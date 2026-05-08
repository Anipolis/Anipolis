<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let username = $state(untrack(() => data.profile?.username ?? ""));
let saving = $state(false);

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
</script>

<svelte:head> <title>アカウント - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">アカウント</h1>
				<a href="/settings" class="btn btn-ghost">設定</a>
			</div>

			{#if form?.success}
				<div class="flash-success">ユーザー名を更新しました。</div>
			{/if}

			{#if form && 'message' in form && !('field' in form)}
				<div class="flash-error">{form.message}</div>
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
