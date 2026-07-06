<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import ToggleSwitch from "$lib/components/ToggleSwitch.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let isPrivate = $state(untrack(() => data.profile?.is_private ?? false));
let saving = $state(false);
let justSaved = $state(false);
let formEl = $state<HTMLFormElement | null>(null);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

function autoSave() {
	formEl?.requestSubmit();
}

const privacySubmit: SubmitFunction = () => {
	saving = true;
	justSaved = false;
	return async ({ result, update }) => {
		saving = false;
		await update({ reset: false });
		if (result.type === "failure" || result.type === "error") {
			// 保存に失敗したらサーバー状態へ巻き戻す
			isPrivate = data.profile?.is_private ?? false;
			return;
		}
		// 成功判定は result.type のみで行う(data.profile の再取得有無に依存させない)
		if (data.profile) isPrivate = data.profile.is_private ?? false;
		justSaved = true;
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(() => {
			justSaved = false;
		}, 2000);
	};
};
</script>

<svelte:head><title>プライバシー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">プライバシー</h1>
				<span class="autosave-status" class:visible={saving || justSaved} aria-live="polite">
					{#if saving}
						保存中…
					{:else if justSaved}
						✓ 保存しました
					{/if}
				</span>
			</div>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			<form method="POST" action="?/updatePrivacy" use:enhance={privacySubmit} bind:this={formEl}>
				<div class="toggle-row">
					<span class="toggle-row-text">
						<strong>鍵アカウントにする</strong>
						<small>承認した人だけ、マイリストなどをフォロワーだけに表示します。</small>
					</span>
					<ToggleSwitch
						name="is_private"
						bind:checked={isPrivate}
						disabled={saving}
						label="鍵アカウントにする"
						onchange={autoSave}
					/>
				</div>
			</form>
		</div>
	</main>
</div>

<style>
.settings-header-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.autosave-status {
	color: var(--color-text-muted);
	font-size: 0.78rem;
	opacity: 0;
	transition: opacity 0.2s ease;
}
.autosave-status.visible {
	opacity: 1;
}
.toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 0;
}
.toggle-row-text strong,
.toggle-row-text small {
	display: block;
}
.toggle-row-text small {
	margin-top: 2px;
	color: var(--color-text-muted);
	font-size: 0.82rem;
}
</style>
