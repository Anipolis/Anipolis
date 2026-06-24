<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let word = $state("");
let adding = $state(false);

const muteSubmit: SubmitFunction = () => {
	adding = true;
	return async ({ update }) => {
		adding = false;
		await update();
		if (form?.muteSuccess) word = "";
	};
};
</script>

<svelte:head><title>ミュートワード - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">ミュートワード</h1>
			</div>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/addMute" use:enhance={muteSubmit} class="mute-add-form">
				<div class="field" style="margin-bottom: 0;">
					<label for="word" class="field-label">ミュートするワード</label>
					<input
						id="word"
						name="word"
						type="text"
						class="field-input"
						class:field-error={form && "field" in form && form.field === "word"}
						placeholder="例: ネタバレ"
						maxlength="80"
						bind:value={word}
					>
					{#if form && "field" in form && form.field === "word"}
						<p class="field-error-msg">{form.message}</p>
					{:else}
						<p class="field-hint">英数本文、正規表現、作品名、ハッシュタグに含まれる語を非表示にします。</p>
					{/if}
				</div>
				<button type="submit" class="btn btn-primary" disabled={adding}>
					{adding ? "追加中..." : "追加"}
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
									{new Date(mutedWord.created_at).toLocaleDateString("ja-JP")}
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
		</div>
	</main>
</div>
