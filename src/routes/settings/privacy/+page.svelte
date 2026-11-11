<script lang="ts">
import PrivacyToggles from "$lib/components/PrivacyToggles.svelte";
import SettingsBackLink from "$lib/components/SettingsBackLink.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let status = $state<"idle" | "saving" | "saved">("idle");
</script>

<svelte:head><title>公開範囲 - Anipolis</title></svelte:head>

<div class="page-container" style="justify-content: center;">
	<main style="flex: 0 1 560px; min-width: 0;">
		<div class="settings-card">
			<SettingsBackLink />
			<div class="settings-header-row">
				<h1 class="settings-title">公開範囲</h1>
				<span class="autosave-status" class:visible={status !== "idle"} aria-live="polite">
					{#if status === "saving"}
						保存中…
					{:else if status === "saved"}
						✓ 保存しました
					{/if}
				</span>
			</div>

			<PrivacyToggles
				isPrivate={data.profile?.is_private ?? false}
				listIsPublic={data.profile?.list_is_public ?? true}
				onstatus={(next) => (status = next)}
			/>
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
</style>
