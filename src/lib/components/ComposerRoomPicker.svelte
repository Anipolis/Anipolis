<script lang="ts">
import { onDestroy, onMount } from "svelte";
import type { Attachment } from "svelte/attachments";
import { animePickMeta } from "$lib/anime-picker";
import type { ComposeRoom } from "$lib/compose-draft";
import type { ComposerRoomEntry, ComposerRoomsResponse } from "$lib/composer-rooms";
import type { OpenBroadcastRoomSummary } from "$lib/types";
import { createSearchGate } from "$lib/utils/search-gate";
import AnimeRow from "./AnimeRow.svelte";
import Modal from "./Modal.svelte";

/**
 * 投稿に付けるルームを選ぶ。上に放送中の話（近道）、下で作品を探して話数・特番・作品ルームを選ぶ。
 * 話数ルームは期限なしで書けるので、放送中でなくても選べる（まだ放送されていない話は選べない）
 */
type Props = {
	onselect: (room: ComposeRoom) => void;
	onclose: () => void;
};

let { onselect, onclose }: Props = $props();

interface AnimeResult {
	id: string;
	title: string;
	cover_url: string | null;
	type?: string | null;
	aired_from?: string | null;
}

let liveRooms = $state<OpenBroadcastRoomSummary[] | null>(null);
let query = $state("");
let results = $state<AnimeResult[]>([]);
let searching = $state(false);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
const searchGate = createSearchGate();

let pickedAnime = $state<AnimeResult | null>(null);
let animeRooms = $state<ComposerRoomsResponse | null>(null);
let animeRoomsError = $state(false);
const roomsGate = createSearchGate();

const roomAnime = (anime: { id: string; title: string; cover_url: string | null }) => ({
	id: anime.id,
	title: anime.title,
	cover_url: anime.cover_url ?? null,
});

onMount(async () => {
	try {
		// 放送中の話だけ。作品ルームは放送とは関係なく開いているので、作品を探して選ぶ
		const res = await fetch("/api/rooms/open?kind=episode");
		liveRooms = res.ok ? ((await res.json()) as OpenBroadcastRoomSummary[]) : [];
	} catch {
		liveRooms = [];
	}
});

onDestroy(() => {
	if (searchDebounce) clearTimeout(searchDebounce);
	searchGate.cancel();
	roomsGate.cancel();
});

// 開いたとき・作品の選び直しで戻ったときは検索欄から打てるようにする。showModal() が先頭の
// ボタンにフォーカスを置いた後に移すため、次のフレームで動かす
const focusWhenShown: Attachment<HTMLInputElement> = (input) => {
	const frame = requestAnimationFrame(() => input.focus());
	return () => cancelAnimationFrame(frame);
};

function handleQueryInput() {
	if (searchDebounce) clearTimeout(searchDebounce);
	searchGate.cancel();
	if (query.trim().length === 0) {
		results = [];
		searching = false;
		return;
	}
	searchDebounce = setTimeout(async () => {
		const request = searchGate.start();
		searching = true;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(query.trim())}`, {
				signal: request.signal,
			});
			const found = res.ok ? ((await res.json()) as AnimeResult[]) : [];
			if (request.isCurrent()) results = found;
		} catch {
			if (request.isCurrent()) results = [];
		} finally {
			if (request.isCurrent()) searching = false;
		}
	}, 300);
}

async function pickAnime(anime: AnimeResult) {
	pickedAnime = anime;
	animeRooms = null;
	animeRoomsError = false;
	const request = roomsGate.start();
	try {
		const res = await fetch(`/api/anime/${encodeURIComponent(anime.id)}/rooms`, { signal: request.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = (await res.json()) as ComposerRoomsResponse;
		if (request.isCurrent()) animeRooms = body;
	} catch {
		if (request.isCurrent()) animeRoomsError = true;
	}
}

function backToSearch() {
	roomsGate.cancel();
	pickedAnime = null;
	animeRooms = null;
	animeRoomsError = false;
}

function selectLive(room: OpenBroadcastRoomSummary) {
	if (!room.anime) return;
	onselect({
		anime_id: room.anime_id,
		anime: roomAnime(room.anime),
		label: room.episode_number != null ? `第${room.episode_number}話` : room.room_date,
		session_id: room.id,
	});
}

function selectEntry(anime: AnimeResult, entry: ComposerRoomEntry) {
	if (!entry.open) return;
	const base = { anime_id: anime.id, anime: roomAnime(anime), label: entry.label };
	if (entry.kind === "special" && entry.specialKey) onselect({ ...base, special_key: entry.specialKey });
	else if (entry.episodeNumber != null) onselect({ ...base, episode_number: entry.episodeNumber });
}

function selectLobby(anime: AnimeResult, sessionId: string) {
	onselect({ anime_id: anime.id, anime: roomAnime(anime), label: "作品ルーム", session_id: sessionId });
}
</script>

<Modal {onclose} labelledby="composer-room-picker-title">
	<div class="anime-search-modal room-picker">
		<div class="anime-search-header">
			{#if pickedAnime}
				<button type="button" class="anime-search-close" onclick={backToSearch} aria-label="作品の検索に戻る">
					<span class="i-lucide-arrow-left" aria-hidden="true"></span>
				</button>
			{/if}
			<span class="anime-search-title room-picker-title" id="composer-room-picker-title">
				{pickedAnime ? pickedAnime.title : "ルームを選択"}
			</span>
			<button type="button" class="anime-search-close" onclick={onclose} aria-label="閉じる">✕</button>
		</div>

		{#if pickedAnime}
			{@const anime = pickedAnime}
			<div
				class="anime-search-results room-picker-body"
				aria-live="polite"
				aria-busy={animeRooms === null && !animeRoomsError}
			>
				{#if animeRoomsError}
					<p class="anime-search-empty">ルームを読み込めませんでした</p>
				{:else if animeRooms === null}
					<p class="anime-search-empty">読み込み中…</p>
				{:else if animeRooms.roomType === "global"}
					{@const lobbySessionId = animeRooms.lobbySessionId}
					{#if lobbySessionId}
						<AnimeRow
							coverUrl={anime.cover_url}
							title="作品ルーム"
							meta="この作品について、いつでも話せるルーム"
							onclick={() => selectLobby(anime, lobbySessionId)}
						/>
					{:else}
						<p class="anime-search-empty">作品ルームを開けませんでした</p>
					{/if}
				{:else if animeRooms.entries.length === 0}
					<p class="anime-search-empty">この作品にはまだルームがありません</p>
				{:else}
					<p class="room-picker-hint">話数を選んでください（まだ放送されていない話は選べません）</p>
					<div class="room-picker-grid">
						{#each animeRooms.entries as entry (entry.key)}
							<button
								type="button"
								class="room-picker-chip"
								class:room-picker-chip--special={entry.kind === "special"}
								disabled={!entry.open}
								aria-label={entry.open ? entry.label : `${entry.label}（未放送）`}
								title={entry.label}
								onclick={() => selectEntry(anime, entry)}
							>
								{entry.chip}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<input
				type="text"
				class="anime-search-input"
				placeholder="作品を検索"
				aria-label="作品を検索"
				bind:value={query}
				oninput={handleQueryInput}
				{@attach focusWhenShown}
			>
			<div class="anime-search-results" aria-live="polite" aria-busy={searching}>
				{#if query.trim()}
					{#if searching && results.length === 0}
						<p class="anime-search-empty">検索中…</p>
					{:else if results.length === 0}
						<p class="anime-search-empty">見つかりませんでした</p>
					{:else}
						{#each results as anime (anime.id)}
							<AnimeRow
								coverUrl={anime.cover_url}
								title={anime.title}
								meta={animePickMeta(anime)}
								onclick={() => void pickAnime(anime)}
							/>
						{/each}
					{/if}
				{:else if liveRooms === null}
					<p class="anime-search-empty">読み込み中…</p>
				{:else if liveRooms.length > 0}
					<p class="room-picker-section">放送中</p>
					{#each liveRooms as room (room.id)}
						<AnimeRow
							coverUrl={room.anime?.cover_url}
							title={room.anime?.title ?? "不明"}
							meta={room.episode_number != null ? `第${room.episode_number}話` : room.room_date}
							onclick={() => selectLive(room)}
						/>
					{/each}
				{:else}
					<p class="anime-search-empty">作品を検索して、話数のルームを選べます</p>
				{/if}
			</div>
		{/if}
	</div>
</Modal>

<style>
.room-picker {
	min-height: min(420px, 80vh);
}
.room-picker-title {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.room-picker-section {
	margin: 4px 6px 2px;
	color: var(--color-text-muted);
	font-size: 12px;
	font-weight: 600;
}
.room-picker-body {
	padding: 12px 16px 16px;
}
.room-picker-hint {
	margin: 0 0 12px;
	color: var(--color-text-muted);
	font-size: 12px;
}
.room-picker-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
	gap: 8px;
}
.room-picker-chip {
	height: 44px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-surface);
	color: var(--color-text);
	font: inherit;
	font-size: 14px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
}
.room-picker-chip:hover:not(:disabled),
.room-picker-chip:focus-visible {
	border-color: var(--color-accent);
	background: var(--color-surface-hover);
}
.room-picker-chip:disabled {
	border-style: dashed;
	background: transparent;
	color: var(--color-text-muted);
	cursor: default;
}
.room-picker-chip--special {
	font-size: 13px;
}
</style>
