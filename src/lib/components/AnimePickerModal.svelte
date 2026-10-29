<script lang="ts">
import { untrack } from "svelte";
import { trapFocus } from "$lib/actions/trapFocus";
import { type AnimePick, animePickMeta } from "$lib/anime-picker";

/**
 * 作品を検索して選び、並べ替えて保存する画面（ベスト作品・コレクションで共用）。
 * 検索欄は上に固定し、文字がある間は下の場所を検索結果に切り替える（ux-guidelines「一覧から選ぶ画面」）。
 * 保存は呼ぶ側の onsave に任せる。失敗したら Error を投げると、その文を画面に出す
 */
interface Props {
	title: string;
	max: number;
	initial: AnimePick[];
	onsave: (animeIds: number[]) => Promise<void>;
	onclose: () => void;
}

let { title, max, initial, onsave, onclose }: Props = $props();

// 開いている間に呼ぶ側の値が変わっても、開いたときの並びから編集する
let picks = $state<AnimePick[]>(untrack(() => [...initial]));
let query = $state("");
let results = $state<AnimePick[]>([]);
let searching = $state(false);
let saving = $state(false);
let errorMessage = $state("");
// 一覧に戻ったとき、足したばかりの作品を軽く光らせる
let lastAddedId = $state<number | null>(null);
let searchInput = $state<HTMLInputElement | null>(null);
let card = $state<HTMLDivElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchController: AbortController | null = null;

const full = $derived(picks.length >= max);
const pickedIds = $derived(new Set(picks.map((pick) => pick.id)));
const showingResults = $derived(query.trim().length > 0);

// 開いたら検索欄へ。上限までそろっていて検索欄が使えないときは、Esc や Tab が効くようダイアログ自体へ
$effect(() => {
	if (searchInput && !searchInput.disabled) searchInput.focus();
	else card?.focus();
});

$effect(() => () => cancelSearch());

function close() {
	if (saving) return;
	cancelSearch();
	onclose();
}

function cancelSearch() {
	if (searchTimer) clearTimeout(searchTimer);
	searchTimer = null;
	searchController?.abort();
	searchController = null;
	searching = false;
}

function clearQuery() {
	cancelSearch();
	query = "";
	results = [];
}

function onSearchInput() {
	cancelSearch();
	const q = query.trim();
	if (!q) {
		results = [];
		return;
	}
	searching = true;
	searchTimer = setTimeout(async () => {
		const controller = new AbortController();
		searchController = controller;
		try {
			const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
			const found = res.ok ? ((await res.json()) as AnimePick[]) : [];
			if (searchController === controller) results = found;
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError") && searchController === controller) {
				results = [];
			}
		} finally {
			if (searchController === controller) {
				searching = false;
				searchController = null;
			}
		}
	}, 250);
}

function addPick(anime: AnimePick) {
	if (full || pickedIds.has(anime.id)) return;
	picks = [
		...picks,
		{
			id: anime.id,
			title: anime.title,
			cover_url: anime.cover_url,
			type: anime.type,
			aired_from: anime.aired_from,
		},
	];
	lastAddedId = anime.id;
	errorMessage = "";
	// 上限に届いたら、これ以上は足せないので一覧に戻す
	if (picks.length >= max) {
		clearQuery();
		return;
	}
	// 押したボタンは「選択済み」で使えなくなるので、続けて探せるよう入力欄に戻す
	searchInput?.focus();
}

function removePick(index: number) {
	picks = picks.filter((_, i) => i !== index);
	errorMessage = "";
}

function movePick(index: number, offset: -1 | 1) {
	const target = index + offset;
	if (target < 0 || target >= picks.length) return;
	const next = [...picks];
	[next[index], next[target]] = [next[target] as AnimePick, next[index] as AnimePick];
	picks = next;
}

async function save() {
	saving = true;
	errorMessage = "";
	try {
		await onsave(picks.map((pick) => pick.id));
		saving = false;
		close();
	} catch (saveError) {
		errorMessage = saveError instanceof Error ? saveError.message : "保存に失敗しました";
		saving = false;
	}
}
</script>

{#snippet cover(url: string | null)}
	<span class="picker-cover">
		{#if url}
			<img src={url} alt="">
		{:else}
			<span class="picker-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
		{/if}
	</span>
{/snippet}

{#snippet titleBlock(anime: AnimePick)}
	{@const meta = animePickMeta(anime)}
	<span class="picker-text">
		<span class="picker-title">{anime.title}</span>
		{#if meta}
			<span class="picker-meta">{meta}</span>
		{/if}
	</span>
{/snippet}

<div class="picker-overlay" role="presentation" onclick={close}>
	<div
		bind:this={card}
		use:trapFocus
		class="picker-card"
		role="dialog"
		aria-modal="true"
		aria-labelledby="anime-picker-title"
		tabindex="-1"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => {
			event.stopPropagation();
			if (event.key !== "Escape") return;
			// 検索中の Esc は検索をやめて一覧に戻るだけにする
			if (showingResults) {
				event.preventDefault();
				clearQuery();
				return;
			}
			close();
		}}
	>
		<div class="picker-header">
			<span id="anime-picker-title" class="picker-heading">
				{title}
				<span class="picker-count">{picks.length} / {max}</span>
			</span>
			<button type="button" class="picker-close" aria-label="閉じる" disabled={saving} onclick={close}>×</button>
		</div>

		<div class="picker-search">
			<label for="anime-picker-search" class="sr-only">作品を検索</label>
			<span class="picker-search-icon i-lucide-search" aria-hidden="true"></span>
			<input
				id="anime-picker-search"
				bind:this={searchInput}
				type="search"
				class="field-input picker-search-input"
				placeholder="作品名で検索"
				autocomplete="off"
				disabled={saving || full}
				bind:value={query}
				oninput={onSearchInput}
			>
		</div>

		<div class="picker-body scrollbar-thin-muted">
			{#if showingResults}
				{#if results.length > 0}
					<ul class="picker-list" aria-label="検索結果">
						{#each results as anime (anime.id)}
							{@const picked = pickedIds.has(anime.id)}
							<li>
								<button
									type="button"
									class="picker-row picker-result"
									disabled={saving || picked}
									onclick={() => addPick(anime)}
								>
									{@render cover(anime.cover_url)}
									{@render titleBlock(anime)}
									<span class="picker-result-state">
										{#if picked}
											選択済み
										{:else}
											<span class="i-lucide-plus" aria-hidden="true"></span>
											追加
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else if searching}
					<p class="picker-note">検索しています…</p>
				{:else}
					<p class="picker-note">見つかりませんでした</p>
				{/if}
			{:else}
				{#if full}
					<p class="picker-note">{max}作品まで選べます。入れ替えるときは、どれかを外してください</p>
				{/if}
				{#if picks.length > 0}
					<ol class="picker-list" aria-label="選んだ作品">
						{#each picks as pick, index (pick.id)}
							<li class="picker-row picker-pick" class:just-added={pick.id === lastAddedId}>
								<span class="picker-rank">{index + 1}</span>
								{@render cover(pick.cover_url)}
								{@render titleBlock(pick)}
								<span class="picker-actions">
									<button
										type="button"
										class="picker-icon-button"
										aria-label="{pick.title} を上へ"
										disabled={saving || index === 0}
										onclick={() => movePick(index, -1)}
									>
										<span class="i-lucide-chevron-up" aria-hidden="true"></span>
									</button>
									<button
										type="button"
										class="picker-icon-button"
										aria-label="{pick.title} を下へ"
										disabled={saving || index === picks.length - 1}
										onclick={() => movePick(index, 1)}
									>
										<span class="i-lucide-chevron-down" aria-hidden="true"></span>
									</button>
									<button
										type="button"
										class="picker-icon-button"
										aria-label="{pick.title} を外す"
										disabled={saving}
										onclick={() => removePick(index)}
									>
										<span class="i-lucide-x" aria-hidden="true"></span>
									</button>
								</span>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="picker-note">まだ選んでいません</p>
				{/if}
			{/if}

			{#if errorMessage}
				<p class="field-error-msg" role="alert">{errorMessage}</p>
			{/if}
		</div>

		<div class="picker-footer">
			<button type="button" class="btn btn-ghost" disabled={saving} onclick={close}>キャンセル</button>
			<button type="button" class="btn btn-primary" disabled={saving} onclick={save}>
				{saving ? '保存中...' : '保存する'}
			</button>
		</div>
	</div>
</div>

<style>
.picker-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(15 23 42 / 0.68);
}
/* 中身が切り替わっても大きさが変わらないよう、高さを決めておく */
.picker-card {
	outline: none;
	display: flex;
	flex-direction: column;
	width: min(100%, 520px);
	height: min(640px, calc(100dvh - 32px));
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 12px;
	background: var(--color-surface);
	box-shadow: 0 24px 60px rgb(0 0 0 / 0.36);
}
.picker-header,
.picker-footer {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--color-border);
}
.picker-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border);
	border-bottom: 0;
}
.picker-heading {
	display: flex;
	align-items: baseline;
	gap: 8px;
	font-size: 15px;
	font-weight: 800;
}
.picker-count {
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}
.picker-close {
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 999px;
	corner-shape: round;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
}
.picker-close:hover:not(:disabled) {
	background: var(--color-border);
	color: var(--color-text);
}
.picker-search {
	position: relative;
	flex-shrink: 0;
	padding: 12px 14px 4px;
}
.picker-search-icon {
	position: absolute;
	top: 50%;
	left: 26px;
	width: 16px;
	height: 16px;
	margin-top: 4px;
	color: var(--color-text-muted);
	transform: translateY(-50%);
	pointer-events: none;
}
.picker-search-input {
	padding-left: 36px;
}
.picker-body {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 8px;
	min-height: 0;
	padding: 8px 14px 14px;
	overflow-y: auto;
}
.picker-note {
	margin: 8px 2px;
	color: var(--color-text-muted);
	font-size: 13px;
}
.picker-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.picker-row {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	padding: 6px 8px;
	border-radius: 8px;
}
.picker-pick {
	background: var(--color-bg-card);
}
.picker-pick.just-added {
	animation: picker-just-added 1.6s ease-out;
}
@keyframes picker-just-added {
	from {
		background: var(--color-surface-hover);
		box-shadow: inset 0 0 0 1px var(--color-border-hover);
	}
}
@media (prefers-reduced-motion: reduce) {
	.picker-pick.just-added {
		animation: none;
	}
}
.picker-result {
	width: 100%;
	border: 0;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	text-align: left;
}
.picker-result:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.picker-result:disabled {
	cursor: default;
}
.picker-rank {
	width: 2em;
	flex-shrink: 0;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 700;
	text-align: center;
	font-variant-numeric: tabular-nums;
}
.picker-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	flex-shrink: 0;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background: var(--color-bg-card);
}
.picker-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.picker-cover-empty {
	width: 14px;
	height: 14px;
	color: var(--color-text-muted);
}
.picker-text {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
/* スマホでは右のボタンで幅が狭いので、題名は2行まで折り返す */
.picker-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 14px;
	line-height: 1.35;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.picker-meta {
	overflow: hidden;
	color: var(--color-text-muted);
	font-size: 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.picker-actions {
	display: flex;
	flex-shrink: 0;
	gap: 2px;
}
.picker-icon-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 999px;
	corner-shape: round;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
}
.picker-icon-button:hover:not(:disabled) {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.picker-icon-button:disabled {
	cursor: default;
	opacity: 0.35;
}
/* 「追加」は青にしない（青は「保存する」だけ、ux-guidelines） */
.picker-result-state {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 2px;
	color: var(--color-text);
	font-size: 12px;
}
.picker-result:disabled .picker-result-state {
	color: var(--color-text-muted);
}
</style>
