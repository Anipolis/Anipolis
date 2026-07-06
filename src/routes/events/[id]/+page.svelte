<script lang="ts">
import EventSettingsModal from "$lib/components/EventSettingsModal.svelte";
import LiveRoomView from "$lib/components/room/LiveRoomView.svelte";
import type { ActionData, PageData } from "./$types";

let { data, form }: { data: PageData; form: ActionData } = $props();

let settingsOpen = $state(false);
</script>

<LiveRoomView {data} {form}>
	{#snippet headerActions()}
		{#if data.canManageEvent}
			<button
				type="button"
				class="event-settings-trigger"
				aria-label="イベント設定"
				onclick={() => (settingsOpen = true)}
			>
				<span class="i-lucide-settings" aria-hidden="true"></span>
			</button>
		{/if}
	{/snippet}
</LiveRoomView>

{#if data.canManageEvent}
	<EventSettingsModal
		open={settingsOpen}
		event={data.event}
		canManage={data.canManageEvent}
		onclose={() => (settingsOpen = false)}
	/>
{/if}

<style>
.event-settings-trigger {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border: 0;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	padding: 4px;
}
.event-settings-trigger:hover {
	color: var(--color-accent-hover);
}
</style>
