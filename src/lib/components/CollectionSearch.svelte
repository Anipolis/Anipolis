<script lang="ts">
import { type AnimePick, animePickMeta } from "$lib/anime-picker";
import { MAX_COLLECTION_ITEMS } from "$lib/collections";
import AnimeRow from "./AnimeRow.svelte";

/**
 * コレクションに作品を探して足す検索窓。結果は窓に重ねて出し、押すとすぐ足して閉じる。
 * ティア表は未分類の下に置いて上へ、ほかは見出しの歯車の横に置いて下へ開く。
 */
let {
	addedIds,
	full,
	direction,
	label,
	onpick,
}: {
	addedIds: Set<number>;
	full: boolean;
	direction: "up" | "down";
	label: string;
	onpick: (anime: AnimePick) => void;
} = $props();

let root = $state<HTMLDivElement>();
let input = $state<HTMLInputElement>();
let query = $state("");
// 結果の重なりは、作品を選ぶか、検索窓の外を押すか、Esc で閉じる（打った言葉は残す）
let resultsOpen = $state(false);
let results = $state<AnimePick[]>([]);
let searching = $state(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchController: AbortController | null = null;

function onInput() {
	resultsOpen = true;
	if (searchTimer) clearTimeout(searchTimer);
	searchController?.abort();
	const q = query.trim();
	if (!q) {
		results = [];
		searching = false;
		return;
	}
	searching = true;
	searchTimer = setTimeout(async () => {
		const controller = new AbortController();
		searchController = controller;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
			results = res.ok ? ((await res.json()) as AnimePick[]) : [];
		} catch {
			if (controller.signal.aborted) return;
			results = [];
		}
		searching = false;
	}, 250);
}

function clear() {
	query = "";
	onInput();
	input?.focus();
}

function pick(anime: AnimePick) {
	if (addedIds.has(anime.id) || full) return;
	onpick(anime);
	resultsOpen = false;
}

$effect(() => () => {
	if (searchTimer) clearTimeout(searchTimer);
	searchController?.abort();
});
</script>

<svelte:window
	onclick={(event) => {
		if (resultsOpen && root && !root.contains(event.target as Node | null)) resultsOpen = false;
	}}
	onkeydown={(event) => {
		if (event.key === "Escape") resultsOpen = false;
	}}
/>

<div bind:this={root} class="collection-search collection-search--{direction}">
	<span class="collection-search-icon i-lucide-search" aria-hidden="true"></span>
	<input
		type="search"
		class="collection-search-input"
		placeholder={full ? `${MAX_COLLECTION_ITEMS}作品まで入れられます` : "作品を探して足す"}
		aria-label={label}
		disabled={full}
		bind:this={input}
		bind:value={query}
		oninput={onInput}
		onfocus={() => (resultsOpen = true)}
	>
	{#if query}
		<!-- 標準の×は小さくて押しにくいので、入力欄の右端の高さいっぱいを押せるようにする -->
		<button type="button" class="collection-search-clear" aria-label="検索の言葉を消す" onclick={clear}>
			<span class="i-lucide-x" aria-hidden="true"></span>
		</button>
	{/if}
	{#if resultsOpen && query.trim()}
		<ul class="collection-search-results" aria-label="検索結果">
			{#if searching && results.length === 0}
				<li class="collection-search-note">探しています...</li>
			{:else if results.length === 0}
				<li class="collection-search-note">見つかりませんでした</li>
			{/if}
			{#each results as anime (anime.id)}
				{@const added = addedIds.has(anime.id)}
				<li>
					<AnimeRow
						coverUrl={anime.cover_url}
						title={anime.title}
						meta={added ? "追加済み" : animePickMeta(anime)}
						disabled={added || full}
						onclick={() => pick(anime)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
.collection-search {
	position: relative;
	flex-shrink: 0;
}
.collection-search-icon {
	position: absolute;
	top: 50%;
	left: 10px;
	color: var(--color-text-muted);
	font-size: 14px;
	transform: translateY(-50%);
}
.collection-search-input {
	width: 100%;
	padding: 8px 36px 8px 30px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 13px;
}
.collection-search-input::-webkit-search-cancel-button {
	display: none;
	appearance: none;
}
.collection-search-clear {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	padding: 0;
	border: none;
	border-radius: 0 8px 8px 0;
	background: transparent;
	color: var(--color-text-muted);
	font-size: 16px;
	cursor: pointer;
}
.collection-search-clear:hover {
	color: var(--color-text);
}
.collection-search-results {
	position: absolute;
	right: 0;
	z-index: 20;
	display: flex;
	flex-direction: column;
	gap: 2px;
	width: min(420px, calc(100vw - 24px));
	max-height: min(480px, 60vh);
	margin: 0;
	padding: 6px;
	overflow-y: auto;
	border: 1px solid var(--color-border);
	border-radius: 10px;
	background: var(--color-bg-card);
	list-style: none;
}
.collection-search--up .collection-search-results {
	bottom: calc(100% + 6px);
	box-shadow: 0 -8px 24px rgb(0 0 0 / 0.24);
}
.collection-search--down .collection-search-results {
	top: calc(100% + 6px);
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.24);
}
.collection-search-note {
	padding: 10px 6px;
	color: var(--color-text-muted);
	font-size: 13px;
}
</style>
