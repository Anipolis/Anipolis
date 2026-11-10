<script lang="ts">
import { trapFocus } from "$lib/actions/trapFocus";
import type { OpenBroadcastRoomSummary } from "$lib/types";
import AnimeRow from "./AnimeRow.svelte";

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
	<div
		class="anime-search-overlay live-room-picker-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="ライブ実況ルームを選択"
		tabindex="-1"
		use:trapFocus
	>
		<button
			type="button"
			class="modal-click-target modal-click-layer"
			tabindex="-1"
			aria-label="閉じる"
			onclick={onclose}
		></button>
		<div class="anime-search-modal live-room-picker-modal modal-content-layer">
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
						<AnimeRow
							href="/rooms/anime/{room.anime_id}/{room.room_date}"
							coverUrl={room.anime?.cover_url}
							title={room.anime?.title ?? "不明"}
							meta={room.room_date}
							onclick={onclose}
						/>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
.anime-search-overlay.live-room-picker-overlay {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	background: rgba(0, 0, 0, 0.58);
	pointer-events: auto;
	isolation: isolate;
}

.live-room-picker-modal {
	width: min(480px, calc(100vw - 32px));
	max-height: min(76vh, 620px);
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	box-shadow: 0 24px 80px rgba(0, 0, 0, 0.56);
}

.live-room-picker-modal .anime-search-header,
.live-room-picker-modal .anime-search-results {
	background: var(--color-surface);
}

@media (max-width: 640px) {
	.anime-search-overlay.live-room-picker-overlay {
		padding: 16px;
	}

	.live-room-picker-modal {
		max-height: min(82vh, 620px);
	}
}
</style>
