<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let confirmation = $state("");
let currentPassword = $state("");
let deleting = $state(false);

const username = $derived(data.profile?.username ?? "");
const canSubmit = $derived(
	confirmation.trim().toLowerCase() === username.toLowerCase() &&
		(!data.hasEmailProvider || currentPassword.length > 0),
);

const submitDelete: SubmitFunction = ({ cancel }) => {
	if (!window.confirm("アカウントと投稿・マイリスト・画像をすべて削除します。取り消せません。続けますか？")) {
		cancel();
		return;
	}
	deleting = true;
	return async ({ result, update }) => {
		deleting = false;
		// 成功時はリダイレクトされるため、ここに来るのは失敗したときだけ
		if (result.type !== "redirect") await update({ reset: false });
	};
};
</script>

<svelte:head><title>退会 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">退会</h1>
			</div>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<div class="danger-notice">
				<p class="danger-notice-title">削除されるもの</p>
				<ul class="danger-notice-list">
					<li>アカウントとプロフィール（ユーザー名 @{username}）</li>
					<li>投稿・返信・引用、アップロードした画像</li>
					<li>いいね・リポスト・ブックマーク</li>
					<li>マイリストと視聴の記録</li>
					<li>フォロー・フォロワーの関係、通知</li>
				</ul>
				<p class="danger-notice-note">
					削除は取り消せません。復元もできません。他の人の投稿に付けた返信も一緒に削除されます。
				</p>
				<p class="danger-notice-note">ユーザー名 @{username} は退会後に他の人が取得できるようになります。</p>
			</div>

			<form method="POST" action="?/deleteAccount" use:enhance={submitDelete}>
				<div class="field">
					<label for="confirmation" class="field-label">
						確認のため、ユーザー名を入力<span class="field-required">必須</span>
					</label>
					<div class="field-input-prefix">
						<span class="prefix">@</span>
						<input
							id="confirmation"
							name="confirmation"
							type="text"
							class="field-input has-prefix"
							class:field-error={form && "field" in form && form.field === "confirmation"}
							autocomplete="off"
							placeholder={username}
							required
							bind:value={confirmation}
						>
					</div>
					{#if form && "field" in form && form.field === "confirmation"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">@{username} と入力すると退会できます。</p>
					{/if}
				</div>

				{#if data.hasEmailProvider}
					<div class="field">
						<label for="current-password" class="field-label">
							現在のパスワード<span class="field-required">必須</span>
						</label>
						<input
							id="current-password"
							name="current_password"
							type="password"
							class="field-input"
							class:field-error={form && "field" in form && form.field === "current_password"}
							autocomplete="current-password"
							required
							bind:value={currentPassword}
						>
						{#if form && "field" in form && form.field === "current_password"}
							<p class="field-error-msg">{form.message}</p>
						{/if}
					</div>
				{:else}
					<p class="field-hint">
						セキュリティのため、直近{data.reauthWindowMinutes}分以内にログインしている必要があります。
						時間が経っている場合は、ログインし直してからもう一度お試しください。
					</p>
				{/if}

				<div class="settings-actions">
					<button type="submit" class="btn btn-danger" disabled={deleting || !canSubmit}>
						{deleting ? "削除中..." : "アカウントを削除する"}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>

<style>
.danger-notice {
	border: 1px solid var(--color-danger-border, rgb(220 38 38 / 40%));
	border-radius: 8px;
	padding: 12px 14px;
	margin-bottom: 20px;
}

.danger-notice-title {
	font-weight: 700;
	margin: 0 0 8px;
}

.danger-notice-list {
	margin: 0 0 10px;
	padding-left: 1.2em;
	line-height: 1.7;
}

.danger-notice-note {
	margin: 0 0 6px;
	font-size: 0.875rem;
	opacity: 0.85;
}
</style>
