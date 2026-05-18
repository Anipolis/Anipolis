<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let isPrivate = $state(untrack(() => data.profile?.is_private ?? false));
let word = $state("");
let saving = $state(false);
let adding = $state(false);

const privacySubmit: SubmitFunction = () => {
	saving = true;
	return async ({ result, update }) => {
		saving = false;
		await update({ reset: false });
		if (result.type === "success" && data.profile) {
			isPrivate = data.profile.is_private ?? false;
		}
	};
};

const muteSubmit: SubmitFunction = () => {
	adding = true;
	return async ({ result, update }) => {
		adding = false;
		await update();
		if (result.type === "success") word = "";
	};
};
</script>

<svelte:head> <title>プライバシーと安全 - Anipolis</title> </svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 640px; min-width: 0;">
		<div class="settings-card">
			<div class="settings-header-row">
				<h1 class="settings-title">プライバシーと安全</h1>
				<a href="/settings" class="btn btn-ghost">設定</a>
			</div>

			{#if form && 'message' in form && !('field' in form)}
				<div class="flash-error">{form.message}</div>
			{/if}

			{#if form?.privacySuccess}
				<div class="flash-success">プライバシー設定を更新しました。</div>
			{/if}

			<section class="settings-section">
				<h2 class="settings-section-title">鍵アカウント</h2>
				<form method="POST" action="?/updatePrivacy" use:enhance={privacySubmit}>
					<div class="field">
						<label class="privacy-toggle">
							<input type="checkbox" name="is_private" bind:checked={isPrivate}>
							<span>
								<strong>鍵アカウントにする</strong>
								<small>投稿、いいね、マイリストなどをフォロワーだけに表示します。</small>
							</span>
						</label>
					</div>

					<div class="settings-actions">
						<button type="submit" class="btn btn-primary" disabled={saving}>
							{saving ? '保存中...' : '鍵アカウント設定を保存'}
						</button>
					</div>
				</form>
			</section>

			<section class="settings-section">
				<h2 class="settings-section-title">ミュートワード</h2>
				<form method="POST" action="?/addMute" use:enhance={muteSubmit} class="mute-add-form">
					<div class="field" style="margin-bottom: 0;">
						<label for="word" class="field-label">ミュートするワード</label>
						<input
							id="word"
							name="word"
							type="text"
							class="field-input"
							class:field-error={form && 'field' in form && form.field === 'word'}
							placeholder="例: ネタバレ"
							maxlength="80"
							bind:value={word}
						>
						{#if form && 'field' in form && form.field === 'word'}
							<p class="field-error-msg">{form.message}</p>
						{:else}
							<p class="field-hint">
								投稿本文、引用投稿、作品名、ハッシュタグに含まれる投稿を非表示にします。
							</p>
						{/if}
					</div>
					<button type="submit" class="btn btn-primary" disabled={adding}>
						{adding ? '追加中...' : '追加'}
					</button>
				</form>

				<div class="mute-list">
					{#if data.mutedWords.length === 0}
						<div class="empty-state compact">
							<p>ミュート中のワードはありません。</p>
						</div>
					{:else}
						{#each data.mutedWords as mutedWord (mutedWord.id)}
							<div class="mute-list-item">
								<div>
									<div class="mute-word">{mutedWord.word}</div>
									<time class="mute-date" datetime={mutedWord.created_at}>
										{new Date(mutedWord.created_at).toLocaleDateString('ja-JP')}
									</time>
								</div>
								<form method="POST" action="?/removeMute" use:enhance>
									<input type="hidden" name="id" value={mutedWord.id}>
									<button type="submit" class="btn btn-ghost danger">解除</button>
								</form>
							</div>
						{/each}
					{/if}
				</div>
			</section>
		</div>
	</main>
</div>

<style>
.settings-section {
	padding-top: 18px;
	margin-top: 18px;
	border-top: 1px solid var(--color-border);
}

.settings-section-title {
	margin: 0 0 16px;
	font-size: 1rem;
	font-weight: 700;
	color: var(--color-text);
}
</style>
