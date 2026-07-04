<script lang="ts">
import type { OpenBroadcastRoomSummary } from "$lib/types";
import LiveRoomPickerModal from "./LiveRoomPickerModal.svelte";

interface Props {
	rooms: OpenBroadcastRoomSummary[];
}

let { rooms }: Props = $props();

const singleRoom = $derived(rooms.length === 1 ? rooms[0] : undefined);

let pickerOpen = $state(false);

function openPicker() {
	pickerOpen = true;
}

function closePicker() {
	pickerOpen = false;
}
</script>

<section class="trending-panel live-rooms-panel">
	<div class="trending-header">ライブ実況ルーム</div>

	{#if rooms.length === 0}
		<div class="trending-empty">現在ライブ中の実況ルームはありません</div>
	{:else if singleRoom}
		<a href="/rooms/anime/{singleRoom.anime_id}/{singleRoom.room_date}" class="trending-item live-room-entry">
			{#if singleRoom.anime?.cover_url}
				<img src={singleRoom.anime.cover_url} alt={singleRoom.anime.title} class="anime-search-thumb">
			{:else}
				<div class="anime-search-thumb anime-search-thumb-empty"></div>
			{/if}
			<span class="live-room-entry-info">
				<span class="live-room-entry-title">{singleRoom.anime?.title ?? "不明"}</span>
				<span class="live-room-entry-sub">配信中 · {singleRoom.room_date}</span>
			</span>
		</a>
	{:else}
		<button type="button" class="trending-item live-room-entry live-room-entry-button" onclick={openPicker}>
			<span class="live-room-entry-info">
				<span class="live-room-entry-title">ライブ実況ルームが{rooms.length}件あります</span>
				<span class="live-room-entry-sub">タップして選択</span>
			</span>
		</button>
	{/if}
</section>

<LiveRoomPickerModal open={pickerOpen} rooms={pickerOpen ? rooms : null} onclose={closePicker} />

<style>
.live-rooms-panel {
	margin-bottom: 16px;
}

.live-room-entry {
	width: 100%;
	border: none;
	background: none;
	cursor: pointer;
	font: inherit;
	text-align: left;
}

.live-room-entry-info {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 2px;
}

.live-room-entry-title {
	overflow: hidden;
	color: var(--color-text);
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.live-room-entry-sub {
	color: var(--color-text-muted);
	font-size: 12px;
}
</style>
