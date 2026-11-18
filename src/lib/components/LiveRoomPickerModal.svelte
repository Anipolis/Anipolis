<script lang="ts">
import type { OpenBroadcastRoomSummary } from "#lib/types.ts";
import AnimeRow from "./AnimeRow.svelte";
import Modal from "./Modal.svelte";

type Props = {
	open: boolean;
	rooms: OpenBroadcastRoomSummary[] | null;
	loadError?: boolean;
	onclose: () => void;
};

let { open, rooms, loadError = false, onclose }: Props = $props();
</script>

{#if open}
	<Modal {onclose} label="ライブ実況ルームを選択">
		<div class="anime-search-modal live-room-picker-modal">
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
	</Modal>
{/if}

<style>
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
	.live-room-picker-modal {
		max-height: min(82vh, 620px);
	}
}
</style>
