<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { trapFocus } from "$lib/actions/trapFocus";
import { favoriteAnimeMeta, MAX_FAVORITE_ANIME } from "$lib/favorite-anime";
import type { Anime } from "$lib/types";

interface Pick {
	id: number;
	title: string;
	cover_url: string | null;
	type?: string | null | undefined;
	aired_from?: string | null | undefined;
}

// favorites が null のときは読み込みに失敗している（未登録の [] とは別）。中身が分からないので編集させない
let { favorites, isOwn }: { favorites: Anime[] | null; isOwn: boolean } = $props();

let editing = $state(false);
let picks = $state<Pick[]>([]);
let query = $state("");
let results = $state<Pick[]>([]);
let searching = $state(false);
let saving = $state(false);
let errorMessage = $state("");
// 一覧に戻ったとき、足したばかりの作品を軽く光らせる
let lastAddedId = $state<number | null>(null);
let searchInput = $state<HTMLInputElement | null>(null);
let editorCard = $state<HTMLDivElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchController: AbortController | null = null;

const full = $derived(picks.length >= MAX_FAVORITE_ANIME);
const pickedIds = $derived(new Set(picks.map((pick) => pick.id)));
// 検索欄に文字がある間は、下の場所を検索結果に切り替える（一覧を押し広げて位置がずれないように）
const showingResults = $derived(query.trim().length > 0);

// 開いたら検索欄へ。10件そろっていて検索欄が使えないときは、Esc や Tab が効くようダイアログ自体へ
$effect(() => {
	if (!editing) return;
	if (searchInput && !searchInput.disabled) searchInput.focus();
	else editorCard?.focus();
});

function openEditor() {
	if (!favorites) return;
	picks = favorites.map((anime) => ({
		id: Number(anime.id),
		title: anime.title,
		cover_url: anime.cover_url,
		type: anime.type,
		aired_from: anime.aired_from,
	}));
	query = "";
	results = [];
	errorMessage = "";
	lastAddedId = null;
	editing = true;
}

function closeEditor() {
	if (saving) return;
	cancelSearch();
	editing = false;
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
			const found = res.ok ? ((await res.json()) as Pick[]) : [];
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

function addPick(anime: Pick) {
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
	if (picks.length >= MAX_FAVORITE_ANIME) {
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
	[next[index], next[target]] = [next[target] as Pick, next[index] as Pick];
	picks = next;
}

async function save() {
	saving = true;
	errorMessage = "";
	try {
		const response = await fetch("/api/favorite-anime", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ animeIds: picks.map((pick) => pick.id) }),
		});
		const res = (await response.json().catch(() => ({}))) as { message?: string };
		if (!response.ok) throw new Error(res.message ?? "ベスト作品の保存に失敗しました");
		await invalidateAll();
		saving = false;
		closeEditor();
	} catch (saveError) {
		errorMessage = saveError instanceof Error ? saveError.message : "ベスト作品の保存に失敗しました";
		saving = false;
	}
}
</script>

{#snippet cover(url: string | null)}
	<span class="favorite-pick-cover">
		{#if url}
			<img src={url} alt="">
		{:else}
			<span class="favorite-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
		{/if}
	</span>
{/snippet}

{#snippet titleBlock(anime: Pick)}
	{@const meta = favoriteAnimeMeta(anime)}
	<span class="favorite-pick-text">
		<span class="favorite-pick-title">{anime.title}</span>
		{#if meta}
			<span class="favorite-pick-meta">{meta}</span>
		{/if}
	</span>
{/snippet}

{#if favorites === null}
	{#if isOwn}
		<p class="favorite-shelf-error" role="status">
			ベスト作品を読み込めませんでした。ページを再読み込みしてください
		</p>
	{/if}
{:else if favorites.length > 0}
	<section class="favorite-shelf" aria-labelledby="favorite-shelf-title">
		<div class="favorite-shelf-header">
			<h2 id="favorite-shelf-title" class="favorite-shelf-title">ベスト作品</h2>
			{#if isOwn}
				<button type="button" class="btn btn-ghost favorite-shelf-edit" onclick={openEditor}>編集</button>
			{/if}
		</div>
		<ol class="favorite-shelf-row">
			{#each favorites as anime (anime.id)}
				<li>
					<a href="/anime/{anime.id}" class="favorite-card">
						<span class="favorite-card-cover">
							{#if anime.cover_url}
								<img src={anime.cover_url} alt="" loading="lazy">
							{:else}
								<span class="favorite-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
							{/if}
						</span>
						<span class="favorite-card-title">{anime.title}</span>
					</a>
				</li>
			{/each}
		</ol>
	</section>
{:else if isOwn}
	<!-- 本人にだけ入口を出す。ほかの人には何も出さない -->
	<button type="button" class="favorite-shelf-empty" onclick={openEditor}>
		<span class="i-lucide-plus" aria-hidden="true"></span>
		ベスト作品を選ぶ
	</button>
{/if}

{#if editing}
	<div class="favorite-editor-overlay" role="presentation" onclick={closeEditor}>
		<div
			bind:this={editorCard}
			use:trapFocus
			class="favorite-editor-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="favorite-editor-title"
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
				closeEditor();
			}}
		>
			<div class="favorite-editor-header">
				<span id="favorite-editor-title" class="favorite-editor-title">
					ベスト作品を選ぶ
					<span class="favorite-editor-count">{picks.length} / {MAX_FAVORITE_ANIME}</span>
				</span>
				<button
					type="button"
					class="favorite-editor-close"
					aria-label="閉じる"
					disabled={saving}
					onclick={closeEditor}
				>
					×
				</button>
			</div>

			<div class="favorite-editor-search">
				<label for="favorite-search-input" class="sr-only">作品を検索</label>
				<span class="favorite-search-icon i-lucide-search" aria-hidden="true"></span>
				<input
					id="favorite-search-input"
					bind:this={searchInput}
					type="search"
					class="field-input favorite-search-input"
					placeholder="作品名で検索"
					autocomplete="off"
					disabled={saving || full}
					bind:value={query}
					oninput={onSearchInput}
				>
			</div>

			<div class="favorite-editor-body scrollbar-thin-muted">
				{#if showingResults}
					{#if results.length > 0}
						<ul class="favorite-list" aria-label="検索結果">
							{#each results as anime (anime.id)}
								{@const picked = pickedIds.has(anime.id)}
								<li>
									<button
										type="button"
										class="favorite-row favorite-result"
										disabled={saving || picked}
										onclick={() => addPick(anime)}
									>
										{@render cover(anime.cover_url)}
										{@render titleBlock(anime)}
										<span class="favorite-result-state">
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
						<p class="favorite-editor-note">検索しています…</p>
					{:else}
						<p class="favorite-editor-note">見つかりませんでした</p>
					{/if}
				{:else}
					{#if full}
						<p class="favorite-editor-note">
							{MAX_FAVORITE_ANIME}作品まで選べます。入れ替えるときは、どれかを外してください
						</p>
					{/if}
					{#if picks.length > 0}
						<ol class="favorite-list" aria-label="選んだ作品">
							{#each picks as pick, index (pick.id)}
								<li class="favorite-row favorite-pick" class:just-added={pick.id === lastAddedId}>
									<span class="favorite-pick-rank">{index + 1}</span>
									{@render cover(pick.cover_url)}
									{@render titleBlock(pick)}
									<span class="favorite-pick-actions">
										<button
											type="button"
											class="favorite-icon-button"
											aria-label="{pick.title} を上へ"
											disabled={saving || index === 0}
											onclick={() => movePick(index, -1)}
										>
											<span class="i-lucide-chevron-up" aria-hidden="true"></span>
										</button>
										<button
											type="button"
											class="favorite-icon-button"
											aria-label="{pick.title} を下へ"
											disabled={saving || index === picks.length - 1}
											onclick={() => movePick(index, 1)}
										>
											<span class="i-lucide-chevron-down" aria-hidden="true"></span>
										</button>
										<button
											type="button"
											class="favorite-icon-button"
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
						<p class="favorite-editor-note">まだ選んでいません</p>
					{/if}
				{/if}

				{#if errorMessage}
					<p class="field-error-msg" role="alert">{errorMessage}</p>
				{/if}
			</div>

			<div class="favorite-editor-footer">
				<button type="button" class="btn btn-ghost" disabled={saving} onclick={closeEditor}>キャンセル</button>
				<button type="button" class="btn btn-primary" disabled={saving} onclick={save}>
					{saving ? '保存中...' : '保存する'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
.favorite-shelf {
	margin-top: 16px;
}
.favorite-shelf-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}
.favorite-shelf-title {
	margin: 0;
	font-size: 14px;
	font-weight: 800;
}
.favorite-shelf-edit {
	padding: 4px 10px;
	font-size: 13px;
}
/* スマホは指で横に送る（スクロールバーは出さない。右端の作品が切れて見えるので続きは分かる） */
.favorite-shelf-row {
	display: flex;
	gap: 10px;
	margin: 0;
	padding: 0;
	list-style: none;
	overflow-x: auto;
	scrollbar-width: none;
}
.favorite-shelf-row::-webkit-scrollbar {
	display: none;
}
/* 広い画面では折り返して並べる（横スクロールをマウスで動かさなくて済むように） */
@media (min-width: 768px) {
	.favorite-shelf-row {
		flex-wrap: wrap;
		row-gap: 14px;
		overflow-x: visible;
	}
}
.favorite-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	width: 92px;
	color: var(--color-text);
	text-decoration: none;
}
.favorite-card-cover {
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 8px;
	background: var(--color-bg-card);
	transition: opacity 0.15s;
}
.favorite-card:hover .favorite-card-cover {
	opacity: 0.85;
}
.favorite-card-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.favorite-cover-empty {
	width: 24px;
	height: 24px;
	color: var(--color-text-muted);
}
.favorite-card-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 12px;
	line-height: 1.35;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.favorite-shelf-error {
	margin: 16px 0 0;
	color: var(--color-text-muted);
	font-size: 13px;
}
.favorite-shelf-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: 100%;
	margin-top: 16px;
	padding: 12px;
	border: 1px dashed var(--color-border-hover);
	border-radius: 10px;
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
	font: inherit;
	font-size: 13px;
}
.favorite-shelf-empty:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.favorite-editor-overlay {
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
.favorite-editor-card {
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
.favorite-editor-header,
.favorite-editor-footer {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border-bottom: 1px solid var(--color-border);
}
.favorite-editor-footer {
	justify-content: flex-end;
	border-top: 1px solid var(--color-border);
	border-bottom: 0;
}
.favorite-editor-title {
	display: flex;
	align-items: baseline;
	gap: 8px;
	font-size: 15px;
	font-weight: 800;
}
.favorite-editor-count {
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}
.favorite-editor-close {
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
.favorite-editor-close:hover:not(:disabled) {
	background: var(--color-border);
	color: var(--color-text);
}
.favorite-editor-search {
	position: relative;
	flex-shrink: 0;
	padding: 12px 14px 4px;
}
.favorite-search-icon {
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
.favorite-search-input {
	padding-left: 36px;
}
.favorite-editor-body {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 8px;
	min-height: 0;
	padding: 8px 14px 14px;
	overflow-y: auto;
}
.favorite-editor-note {
	margin: 8px 2px;
	color: var(--color-text-muted);
	font-size: 13px;
}
.favorite-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.favorite-row {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	padding: 6px 8px;
	border-radius: 8px;
}
.favorite-pick {
	background: var(--color-bg-card);
}
.favorite-pick.just-added {
	animation: favorite-just-added 1.6s ease-out;
}
@keyframes favorite-just-added {
	from {
		background: var(--color-surface-hover);
		box-shadow: inset 0 0 0 1px var(--color-border-hover);
	}
}
@media (prefers-reduced-motion: reduce) {
	.favorite-pick.just-added {
		animation: none;
	}
}
.favorite-result {
	width: 100%;
	border: 0;
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
	font: inherit;
	text-align: left;
}
.favorite-result:hover:not(:disabled) {
	background: var(--color-surface-hover);
}
.favorite-result:disabled {
	cursor: default;
}
.favorite-pick-rank {
	width: 1.5em;
	flex-shrink: 0;
	color: var(--color-text-muted);
	font-size: 13px;
	font-weight: 700;
	text-align: center;
}
.favorite-pick-cover {
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
.favorite-pick-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.favorite-pick-cover .favorite-cover-empty {
	width: 14px;
	height: 14px;
}
.favorite-pick-text {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}
/* スマホでは右のボタンで幅が狭いので、題名は2行まで折り返す */
.favorite-pick-title {
	display: -webkit-box;
	overflow: hidden;
	font-size: 14px;
	line-height: 1.35;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}
.favorite-pick-meta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.favorite-pick-meta {
	color: var(--color-text-muted);
	font-size: 12px;
}
.favorite-pick-actions {
	display: flex;
	flex-shrink: 0;
	gap: 2px;
}
.favorite-icon-button {
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
.favorite-icon-button:hover:not(:disabled) {
	background: var(--color-surface-hover);
	color: var(--color-text);
}
.favorite-icon-button:disabled {
	cursor: default;
	opacity: 0.35;
}
/* 「追加」は青にしない（青は「保存する」だけ、ux-guidelines） */
.favorite-result-state {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 2px;
	color: var(--color-text);
	font-size: 12px;
}
.favorite-result:disabled .favorite-result-state {
	color: var(--color-text-muted);
}
</style>
