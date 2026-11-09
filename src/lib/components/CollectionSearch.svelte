<script lang="ts">
import { type AnimePick, animePickMeta } from "$lib/anime-picker";
import { MAX_COLLECTION_ITEMS } from "$lib/collections";
import { coverThumbFallback, coverThumbSrc } from "$lib/cover-image";

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
		if (event.key === 'Escape') resultsOpen = false;
	}}
/>

<div bind:this={root} class="collection-search collection-search--{direction}">
	<span class="collection-search-icon i-lucide-search" aria-hidden="true"></span>
	<input
		type="search"
		class="collection-search-input"
		placeholder={full ? `${MAX_COLLECTION_ITEMS}作品まで入れられます` : '作品を探して足す'}
		aria-label={label}
		disabled={full}
		bind:value={query}
		oninput={onInput}
		onfocus={() => (resultsOpen = true)}
	>
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
					<button
						type="button"
						class="collection-search-result"
						disabled={added || full}
						onclick={() => pick(anime)}
					>
						<span class="collection-search-cover">
							{#if anime.cover_url}
								<img
									src={coverThumbSrc(anime.cover_url)}
									{@attach coverThumbFallback(anime.cover_url)}
									alt=""
									loading="lazy"
								>
							{/if}
						</span>
						<span class="collection-search-text">
							<span class="collection-search-title">{anime.title}</span>
							<span class="collection-search-meta">{added ? '追加済み' : animePickMeta(anime)}</span>
						</span>
					</button>
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
	padding: 8px 10px 8px 30px;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 13px;
}
.collection-search-results {
	position: absolute;
	right: 0;
	z-index: 20;
	display: flex;
	flex-direction: column;
	gap: 2px;
	width: min(340px, calc(100vw - 24px));
	max-height: min(360px, 50vh);
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
	padding: 8px 4px;
	color: var(--color-text-muted);
	font-size: 12px;
}
.collection-search-result {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 4px;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--color-text);
	text-align: left;
	cursor: pointer;
}
.collection-search-result:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.collection-search-result:disabled {
	cursor: default;
	opacity: 0.6;
}
.collection-search-cover {
	flex-shrink: 0;
	width: 28px;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 4px;
	background: var(--color-border);
}
.collection-search-cover img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.collection-search-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}
.collection-search-title {
	overflow: hidden;
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.collection-search-meta {
	color: var(--color-text-muted);
	font-size: 11px;
}
</style>
