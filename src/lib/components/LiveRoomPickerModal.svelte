<script lang="ts">
import { trapFocus } from "$lib/actions/trapFocus";
import type { OpenBroadcastRoomSummary } from "$lib/types";

type Props = {
	open: boolean;
	rooms: OpenBroadcastRoomSummary[] | null;
	loadError?: boolean;
	onclose: () => void;
};

let { open, rooms, loadError = false, onclose }: Props = $props();

$effect(() => {
	if (!open) return;
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") onclose();
	};
	window.addEventListener("keydown", handleKeydown);
	return () => window.removeEventListener("keydown", handleKeydown);
});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="anime-search-overlay live-room-picker-overlay"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose();
		}}
		role="dialog"
		aria-modal="true"
		aria-label="ライブ実況ルームを選択"
		tabindex="-1"
		use:trapFocus
	>
		<div class="anime-search-modal">
			<div class="anime-search-header">
				<span class="anime-search-title">ライブ実況ルームを選択</span>
				<button type="button" class="anime-search-close" onclick={onclose} aria-label="閉じる">
					<span class="i-lucide-x" aria-hidden="true"></span>
				</button>
			</div>
			<div class="anime-search-results">
				{#if rooms === null}
					<p class="anime-search-empty">読み込み中…</p>
				{:else if loadError}
					<p class="anime-search-empty">ライブ実況ルームを読み込めませんでした</p>
				{:else if rooms.length === 0}
					<p class="anime-search-empty">現在ライブ中の実況ルームはありません</p>
				{:else}
					{#each rooms as room (room.id)}
						<a
							href="/rooms/anime/{room.anime_id}/{room.room_date}"
							class="anime-search-item"
							onclick={onclose}
						>
							{#if room.anime?.cover_url}
								<img src={room.anime.cover_url} alt={room.anime.title} class="anime-search-thumb">
							{:else}
								<div class="anime-search-thumb anime-search-thumb-empty"></div>
							{/if}
							<div class="anime-search-item-info">
								<span class="anime-search-item-title">{room.anime?.title ?? "不明"}</span>
								<span class="anime-search-item-sub">{room.room_date}</span>
							</div>
						</a>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
.anime-search-overlay.live-room-picker-overlay {
	z-index: 1200;
	background: rgba(0, 0, 0, 0.72);
	pointer-events: auto;
}
</style>
