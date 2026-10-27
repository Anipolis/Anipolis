<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { onDestroy, untrack } from "svelte";
import { enhance } from "$app/forms";
import { checkAvatarSource } from "$lib/avatar-crop";
import AvatarCropper from "$lib/components/AvatarCropper.svelte";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let username = $state(untrack(() => data.username ?? ""));
let displayName = $state(untrack(() => data.displayName ?? ""));
let submitting = $state(false);
// Discord・Google・X で登録した人は、そのサービスのアイコンを最初から選んだ状態にする。
// プレビューで見えていて「削除」ですぐ外せるので、気づかないうちに使われることはない
// （以前は意図せず使われるのを避けてアイコンなしにしていた。2026-07-28）
let avatarChoice = $state<"oauth" | "upload" | "none">(untrack(() => (data.avatarUrl ? "oauth" : "none")));
let avatarPreviewUrl = $state<string | null>(null);
let avatarMessage = $state("");
let avatarFileInput = $state<HTMLInputElement | null>(null);

// ユーザー名のエラーは、送ったときの名前のままの間だけ出す（直したら消す）。
// サーバーは前後の空白を除いて小文字にそろえた名前を返すので、比べる側も同じようにそろえる
const usernameError = $derived(
	form &&
		"field" in form &&
		form.field === "username" &&
		"username" in form &&
		form.username === username.trim().toLowerCase()
		? form.message
		: null,
);

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
	committedAvatarFile = null;
	if (avatarFileInput) avatarFileInput.value = "";
	if (avatarPreviewUrl) {
		URL.revokeObjectURL(avatarPreviewUrl);
		avatarPreviewUrl = null;
	}
}

// 選んだ画像は、まず切り抜きの画面（AvatarCropper）に回す。決めた範囲の画像をフォームの欄に入れ直して送る
let cropSource = $state<File | null>(null);
// 切り抜きをやめたときに戻す、それまでに選んでいた画像
let committedAvatarFile: File | null = null;

function updateAvatarFile(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	avatarMessage = "";
	const problem = checkAvatarSource(file);
	restoreCommittedFile();
	if (problem) {
		avatarMessage = problem;
		return;
	}
	cropSource = file;
}

/** フォームの欄を、切り抜いて決めた画像（無ければ空）に戻す */
function restoreCommittedFile() {
	if (!avatarFileInput) return;
	const transfer = new DataTransfer();
	if (committedAvatarFile) transfer.items.add(committedAvatarFile);
	avatarFileInput.files = transfer.files;
}

function applyCroppedAvatar(cropped: File) {
	cropSource = null;
	committedAvatarFile = cropped;
	restoreCommittedFile();
	if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
	avatarPreviewUrl = URL.createObjectURL(cropped);
	avatarChoice = "upload";
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

			<p class="field-hint" style="margin-bottom: 1.25rem;">あとから設定で変更できます。</p>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/save" enctype="multipart/form-data" novalidate use:enhance={onSubmit}>
				<input type="hidden" name="next" value={data.next}>
				<input type="hidden" name="avatar_choice" value={avatarChoice}>

				<div class="onboarding-avatar-row">
					<!-- アイコンを押しても画像を選べる。Tab の移動先と読み上げは「画像を変更」だけにする（同じ操作を 2 つ並べない） -->
					<label for="onboarding-avatar-input" class="avatar-pick" aria-hidden="true">
						<UserAvatar src={selectedAvatarUrl} username={displayName || username} size="lg" />
					</label>
					<div class="onboarding-avatar-copy">
						<div class="field-label">プロフィール画像</div>
						<div class="onboarding-avatar-actions">
							<label class="btn btn-outline onboarding-avatar-file">
								画像を変更
								<input
									id="onboarding-avatar-input"
									type="file"
									name="avatar_file"
									accept="image/jpeg,image/png,image/webp"
									disabled={submitting}
									bind:this={avatarFileInput}
									onchange={updateAvatarFile}
								>
							</label>
							<!-- 画像が入っているときだけ出す。外すと頭文字のアイコンに戻る（外部サービスのアイコンも、アップロードした画像も同じ） -->
							{#if avatarChoice !== "none"}
								<button type="button" class="btn btn-ghost" disabled={submitting} onclick={clearAvatar}>
									削除
								</button>
							{/if}
						</div>
						{#if form && "field" in form && form.field === "avatar"}
							<p class="field-error-msg">{form.message}</p>
						{:else if avatarMessage}
							<p class="field-error-msg">{avatarMessage}</p>
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
							class:field-error={usernameError !== null}
							aria-invalid={usernameError !== null}
							maxlength="20"
							pattern={"[a-zA-Z0-9_]{3,20}"}
							required
							bind:value={username}
						>
					</div>
					{#if usernameError}
						<p class="field-error-msg">{usernameError}</p>
					{:else}
						<p class="field-hint">3〜20文字の半角英数字と _（アンダースコア）が使えます。</p>
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
					<!-- ユーザー名は新しく決める欄で、ブラウザが自動入力しないので、空の間は押せなくする（ux-guidelines） -->
					<button
						type="submit"
						class="btn btn-primary onboarding-submit"
						disabled={submitting || username.trim() === ""}
					>
						{submitting ? "保存中..." : "はじめる"}
					</button>
				</div>
			</form>
		</div>
	</div>
</div>

{#if cropSource}
	<AvatarCropper
		file={cropSource}
		onconfirm={applyCroppedAvatar}
		oncancel={() => {
			cropSource = null;
		}}
	/>
{/if}

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

/* 「画像を変更」は補助の操作なので灰色の枠にし、青は「はじめる」だけに残す（ux-guidelines） */
.onboarding-avatar-file {
	border-color: var(--color-border-hover);
	color: var(--fg);
}

.onboarding-avatar-file:hover {
	background: var(--bg-hover);
}

.onboarding-avatar-file input {
	display: none;
}

.onboarding-submit:disabled {
	background: var(--bg-hover);
	color: var(--fg-muted);
	box-shadow: none;
	cursor: not-allowed;
}

@media (max-width: 560px) {
	.onboarding-avatar-row {
		align-items: flex-start;
	}

	/* スマホではログイン画面のボタンと同じく横幅いっぱいにする */
	.onboarding-submit {
		width: 100%;
		justify-content: center;
	}
}
</style>
