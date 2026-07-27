<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onDestroy, untrack } from "svelte";
import { enhance } from "$app/forms";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let username = $state(untrack(() => data.username ?? ""));
let displayName = $state(untrack(() => data.displayName ?? ""));
let submitting = $state(false);
// 招待制になりGoogle/Discord/X等ログイン元の写真が意図せず適用されうるため、
// デフォルトはアイコンなし（グレー）。ログイン元の画像は「候補を使う」で明示的に選んだ時のみ使う。
let avatarChoice = $state<"oauth" | "upload" | "none">("none");
let avatarPreviewUrl = $state<string | null>(null);
let avatarMessage = $state("");
let avatarFileInput = $state<HTMLInputElement | null>(null);

const selectedAvatarUrl = $derived(
	avatarChoice === "upload" ? avatarPreviewUrl : avatarChoice === "oauth" ? data.avatarUrl : null,
);

const onSubmit: SubmitFunction = () => {
	submitting = true;
	return async ({ update }) => {
		submitting = false;
		await update({ reset: false });
	};
};

function clearSelectedAvatarFile() {
	if (avatarFileInput) avatarFileInput.value = "";
	if (avatarPreviewUrl) {
		URL.revokeObjectURL(avatarPreviewUrl);
		avatarPreviewUrl = null;
	}
}

function updateAvatarFile(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	avatarMessage = "";
	if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
		avatarMessage = "JPEG、PNG、WebP形式の画像を選択してください。";
		clearSelectedAvatarFile();
		avatarChoice = "none";
		return;
	}
	if (file.size > 2 * 1024 * 1024) {
		avatarMessage = "画像は2MB以内にしてください。";
		clearSelectedAvatarFile();
		avatarChoice = "none";
		return;
	}

	if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
	avatarPreviewUrl = URL.createObjectURL(file);
	avatarChoice = "upload";
}

function useOAuthAvatar() {
	clearSelectedAvatarFile();
	avatarChoice = data.avatarUrl ? "oauth" : "none";
	avatarMessage = "";
}

function clearAvatar() {
	clearSelectedAvatarFile();
	avatarChoice = "none";
	avatarMessage = "";
}

onDestroy(clearSelectedAvatarFile);
</script>

<svelte:head><title>プロフィールの設定 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<div style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">ようこそ！プロフィールを設定しましょう</h1>
			</div>

			<p class="field-hint" style="margin-bottom: 1.25rem;">
				ログイン情報からそのまま使える候補だけ初期値にしています。必要に応じて変更してください。
			</p>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/save" enctype="multipart/form-data" use:enhance={onSubmit}>
				<input type="hidden" name="next" value={data.next}>
				<input type="hidden" name="avatar_choice" value={avatarChoice}>

				<div class="onboarding-avatar-row">
					<UserAvatar src={selectedAvatarUrl} username={displayName || username} size="lg" />
					<div class="onboarding-avatar-copy">
						<div class="field-label">プロフィール画像</div>
						<p class="field-hint">ログイン元のアイコン候補を使うか、Anipolis用の画像に変更できます。</p>
						<div class="onboarding-avatar-actions">
							<label class="btn btn-outline onboarding-avatar-file">
								画像を変更
								<input
									type="file"
									name="avatar_file"
									accept="image/jpeg,image/png,image/webp"
									disabled={submitting}
									bind:this={avatarFileInput}
									onchange={updateAvatarFile}
								>
							</label>
							{#if data.avatarUrl}
								<button
									type="button"
									class="btn btn-ghost"
									disabled={submitting}
									onclick={useOAuthAvatar}
								>
									候補を使う
								</button>
							{/if}
							<button type="button" class="btn btn-ghost" disabled={submitting} onclick={clearAvatar}>
								使わない
							</button>
						</div>
						{#if form && "field" in form && form.field === "avatar"}
							<p class="field-error-msg">{form.message}</p>
						{:else if avatarMessage}
							<p class="field-error-msg">{avatarMessage}</p>
						{:else}
							<p class="field-hint">JPEG、PNG、WebP・最大2MB。</p>
						{/if}
					</div>
				</div>

				<div class="field">
					<label for="username" class="field-label">
						ユーザー名<span class="field-required">必須</span>
					</label>
					<div class="field-input-prefix">
						<span class="prefix">@</span>
						<input
							id="username"
							name="username"
							type="text"
							class="field-input has-prefix"
							class:field-error={form && "field" in form && form.field === "username"}
							placeholder="animetaro"
							maxlength="20"
							pattern={"[a-zA-Z0-9_]{3,20}"}
							required
							bind:value={username}
						>
					</div>
					{#if form && "field" in form && form.field === "username"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">
							3〜20文字の半角英数字・アンダースコアのみ使用できます。候補が空の場合はAnipolis用に入力してください。
						</p>
					{/if}
				</div>

				<div class="field">
					<label for="display_name" class="field-label">表示名</label>
					<input
						id="display_name"
						name="display_name"
						type="text"
						class="field-input"
						class:field-error={form && "field" in form && form.field === "display_name"}
						placeholder="アニメ太郎"
						maxlength="50"
						bind:value={displayName}
					>
					{#if form && "field" in form && form.field === "display_name"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">空欄の場合はユーザー名が表示名として使われます。</p>
					{/if}
				</div>

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={submitting}>
						{submitting ? "保存中..." : "はじめる"}
					</button>
				</div>
			</form>
		</div>
	</div>
</div>

<style>
.onboarding-avatar-row {
	display: flex;
	align-items: center;
	gap: 16px;
	margin-bottom: 24px;
	padding-bottom: 24px;
	border-bottom: 1px solid var(--color-border);
}

.onboarding-avatar-copy {
	min-width: 0;
	flex: 1;
}

.onboarding-avatar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 12px 0 6px;
}

.onboarding-avatar-file input {
	display: none;
}

@media (max-width: 560px) {
	.onboarding-avatar-row {
		align-items: flex-start;
	}
}
</style>
