<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { MAX_FAVORITE_ANIME } from "$lib/favorite-anime";
import type { Anime } from "$lib/types";

interface Pick {
	id: number;
	title: string;
	cover_url: string | null;
}

let { favorites, isOwn }: { favorites: Anime[]; isOwn: boolean } = $props();

let editing = $state(false);
let picks = $state<Pick[]>([]);
let query = $state("");
let results = $state<Pick[]>([]);
let searching = $state(false);
let saving = $state(false);
let errorMessage = $state("");
let searchInput = $state<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchController: AbortController | null = null;

const full = $derived(picks.length >= MAX_FAVORITE_ANIME);
const pickedIds = $derived(new Set(picks.map((pick) => pick.id)));

$effect(() => {
	if (editing && searchInput) searchInput.focus();
});

function openEditor() {
	picks = favorites.map((anime) => ({ id: Number(anime.id), title: anime.title, cover_url: anime.cover_url }));
	query = "";
	results = [];
	errorMessage = "";
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
	picks = [...picks, { id: anime.id, title: anime.title, cover_url: anime.cover_url }];
	errorMessage = "";
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

{#if favorites.length > 0}
	<section class="favorite-shelf" aria-labelledby="favorite-shelf-title">
		<div class="favorite-shelf-header">
			<h2 id="favorite-shelf-title" class="favorite-shelf-title">ベスト作品</h2>
			{#if isOwn}
				<button type="button" class="btn btn-ghost favorite-shelf-edit" onclick={openEditor}>編集</button>
			{/if}
		</div>
		<ol class="favorite-shelf-row scrollbar-thin-muted">
			{#each favorites as anime (anime.id)}
				<li>
					<a href="/anime/{anime.id}" class="favorite-card">
						<span class="favorite-card-cover">
							{#if anime.cover_url}
								<img src={anime.cover_url} alt="" loading="lazy">
							{:else}
								<span class="favorite-card-cover-empty i-lucide-clapperboard" aria-hidden="true"></span>
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
			class="favorite-editor-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="favorite-editor-title"
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") closeEditor();
			}}
		>
			<div class="favorite-editor-header">
				<span id="favorite-editor-title" class="favorite-editor-title">ベスト作品を選ぶ</span>
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

			<div class="favorite-editor-body scrollbar-thin-muted">
				{#if picks.length > 0}
					<ol class="favorite-picks" aria-label="選んだ作品">
						{#each picks as pick, index (pick.id)}
							<li class="favorite-pick">
								<span class="favorite-pick-rank">{index + 1}</span>
								<span class="favorite-pick-cover">
									{#if pick.cover_url}
										<img src={pick.cover_url} alt="">
									{/if}
								</span>
								<span class="favorite-pick-title">{pick.title}</span>
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
				{/if}

				<div class="favorite-search">
					<label for="favorite-search-input" class="field-label">作品を追加</label>
					<input
						id="favorite-search-input"
						bind:this={searchInput}
						type="search"
						class="field-input"
						autocomplete="off"
						disabled={saving || full}
						bind:value={query}
						oninput={onSearchInput}
					>
					{#if full}
						<p class="field-hint">
							{MAX_FAVORITE_ANIME}作品まで選べます。入れ替えるときは、どれかを外してください
						</p>
					{:else if query.trim() && !searching && results.length === 0}
						<p class="field-hint">見つかりませんでした</p>
					{/if}
					{#if !full && results.length > 0}
						<ul class="favorite-results" aria-label="検索結果">
							{#each results as anime (anime.id)}
								{@const picked = pickedIds.has(anime.id)}
								<li>
									<button
										type="button"
										class="favorite-result"
										disabled={saving || picked}
										onclick={() => addPick(anime)}
									>
										<span class="favorite-pick-cover">
											{#if anime.cover_url}
												<img src={anime.cover_url} alt="">
											{/if}
										</span>
										<span class="favorite-pick-title">{anime.title}</span>
										<span class="favorite-result-state">{picked ? '選択済み' : '追加'}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

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
.favorite-shelf-row {
	display: flex;
	gap: 10px;
	margin: 0;
	padding: 0 0 8px;
	list-style: none;
	overflow-x: auto;
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
.favorite-card-cover-empty {
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
.favorite-editor-card {
	display: flex;
	flex-direction: column;
	width: min(100%, 520px);
	max-height: calc(100dvh - 32px);
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
	font-size: 15px;
	font-weight: 800;
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
.favorite-editor-body {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	gap: 16px;
	min-height: 0;
	padding: 14px;
	overflow-y: auto;
}
.favorite-picks,
.favorite-results {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.favorite-results {
	margin-top: 8px;
}
.favorite-pick,
.favorite-result {
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
	width: 32px;
	flex-shrink: 0;
	aspect-ratio: 400 / 566;
	overflow: hidden;
	border-radius: 4px;
	background: var(--color-border);
}
.favorite-pick-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.favorite-pick-title {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	font-size: 14px;
	text-overflow: ellipsis;
	white-space: nowrap;
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
.favorite-result-state {
	flex-shrink: 0;
	color: var(--color-text-muted);
	font-size: 12px;
}
.favorite-result:not(:disabled) .favorite-result-state {
	color: var(--color-primary);
}
</style>
