<script lang="ts">
import type { SubmitFunction } from "@sveltejs/kit";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

let isPrivate = $state(untrack(() => data.profile?.is_private ?? false));
let saving = $state(false);

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
</script>

<svelte:head><title>プライバシー - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">プライバシー</h1>
			</div>

			{#if form && "message" in form && !("field" in form)}
				<div class="flash-error" role="alert">{form.message}</div>
			{/if}

			{#if form?.privacySuccess}
				<div class="flash-success">プライバシー設定を更新しました。</div>
			{/if}

			<form method="POST" action="?/updatePrivacy" use:enhance={privacySubmit}>
				<div class="field">
					<label class="privacy-toggle">
						<input type="checkbox" name="is_private" bind:checked={isPrivate}>
						<span>
							<strong>鍵アカウントにする</strong>
							<small>承認した人だけ、マイリストなどをフォロワーだけに表示します。</small>
						</span>
					</label>
				</div>

				<div class="settings-actions">
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{saving ? "保存中..." : "プライバシー設定を保存"}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>
