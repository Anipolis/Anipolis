<script lang="ts">
import { goto } from "$app/navigation";
import { ANIME_GENRES, ANIME_SOURCE_OPTIONS } from "$lib/anime-vocabulary";
import AnimeRegisterForm from "$lib/components/AnimeRegisterForm.svelte";
import MyListModal from "$lib/components/MyListModal.svelte";
import type { ActiveAnimeSeasonChip, AnimeListItem, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const GENRES = [...ANIME_GENRES];
const SOURCE_OPTIONS = [...ANIME_SOURCE_OPTIONS];

const tabs = [
	{ id: "all", label: "すべて" },
	{ id: "popular", label: "人気" },
	{ id: "trending", label: "トレンド" },
	{ id: "top_rated", label: "高評価" },
	{ id: "airing", label: "放送中" },
	{ id: "upcoming", label: "放送予定" },
	{ id: "mylist", label: "マイリスト" },
] as const;

const ANIME_SECTION_SIZE = 50;
type ActiveSeasonChip = ActiveAnimeSeasonChip;
type AnimeFilterState = {
	search: string;
	genres: string[];
	year: string;
	seasons: ActiveSeasonChip[];
	studio: string;
	producer: string;
	source: string;
};

const SEASON_CHIPS: ActiveSeasonChip[] = ["冬", "春", "夏", "秋"];

const statusLabels: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	dropped: "断念",
	on_hold: "中断",
};

function animeStatusBadge(anime: AnimeListItem): string {
	if (anime.computed_broadcast_status === "airing") return "放送中";
	if (anime.computed_broadcast_status === "upcoming") return "放送予定";
	if (anime.computed_broadcast_status === "finished") return "放送終了";
	return "未定";
}

let quickAddAnime = $state<AnimeListItem | null>(null);
// svelte-ignore state_referenced_locally
let filterState = $state<AnimeFilterState>({
	search: data.search ?? "",
	genres: data.genres ?? data.genre?.split(",").filter(Boolean) ?? [],
	year: data.broadcastYear ?? "",
	seasons: data.broadcastSeasons ?? (data.broadcastSeason ? [data.broadcastSeason as ActiveSeasonChip] : []),
	studio: data.studio ?? "",
	producer: data.producer ?? "",
	source: data.source ?? "",
});

// フィルターボトムシート
let filterSheetOpen = $state(false);
let filterDrawerOpen = $state(false);
function buildGenreMap(selected: string[]): Record<string, boolean> {
	const set = new Set(selected);
	return Object.fromEntries(GENRES.map((g) => [g, set.has(g)]));
}
// svelte-ignore state_referenced_locally
let pendingGenreMap = $state<Record<string, boolean>>(
	buildGenreMap(data.genres ?? data.genre?.split(",").filter(Boolean) ?? []),
);
// svelte-ignore state_referenced_locally
let pendingYear = $state(data.broadcastYear ?? "");
// svelte-ignore state_referenced_locally
let pendingSeasons = $state<ActiveSeasonChip[]>(
	data.broadcastSeasons ?? (data.broadcastSeason ? [data.broadcastSeason as ActiveSeasonChip] : []),
);
// svelte-ignore state_referenced_locally
let pendingStudio = $state(data.studio ?? "");
// svelte-ignore state_referenced_locally
let pendingProducer = $state(data.producer ?? "");
// svelte-ignore state_referenced_locally
let pendingSource = $state(data.source ?? "");
let sheetResultCount = $state<number | null>(null);
let sheetCountLoading = $state(false);
let hasActiveFilters = $derived(
	Boolean(
		data.search ||
			data.genre ||
			data.broadcastYear ||
			data.broadcastSeason ||
			data.broadcastSeasons?.length ||
			data.studio ||
			data.producer ||
			data.source,
	),
);
// ページネーションはサーバー駆動（data.page / data.total）。表示は data.animes（現在ページ分）を直接使う。
let pageSize = $derived(data.pageSize || ANIME_SECTION_SIZE);
let totalPages = $derived(Math.max(1, Math.ceil((data.total ?? data.animes.length) / pageSize)));
let currentAnimeSectionIndex = $derived(Math.min(Math.max((data.page ?? 1) - 1, 0), totalPages - 1));
let pageStartRank = $derived(currentAnimeSectionIndex * pageSize);
let visibleAnimeSectionPages = $derived(getVisibleAnimeSectionPages(totalPages, currentAnimeSectionIndex, 7));
let visibleMobileAnimeSectionPages = $derived(getVisibleAnimeSectionPages(totalPages, currentAnimeSectionIndex, 5));
let previousDataFilterKey = $state("");

function toFilterState(): AnimeFilterState {
	return {
		search: data.search ?? "",
		genres: data.genres ?? data.genre?.split(",").filter(Boolean) ?? [],
		year: data.broadcastYear ?? "",
		seasons: data.broadcastSeasons ?? (data.broadcastSeason ? [data.broadcastSeason as ActiveSeasonChip] : []),
		studio: data.studio ?? "",
		producer: data.producer ?? "",
		source: data.source ?? "",
	};
}

function buildAnimeFilterUrl(filters: AnimeFilterState, tabId: string = data.tab) {
	const params = new URLSearchParams();
	if (filters.search.trim()) params.set("search", filters.search.trim());
	if (filters.genres.length) params.set("genres", filters.genres.join(","));
	if (filters.year.trim()) params.set("year", filters.year.trim());
	if (filters.seasons.length) params.set("seasons", filters.seasons.join(","));
	if (filters.studio.trim()) params.set("studio", filters.studio.trim());
	if (filters.producer.trim()) params.set("producer", filters.producer.trim());
	if (filters.source.trim()) params.set("source", filters.source.trim());
	if (tabId && tabId !== "popular") params.set("tab", tabId);
	const qs = params.toString();
	return qs ? `/anime?${qs}` : "/anime";
}

function buildAnimeTabUrl(tabId: string) {
	return buildAnimeFilterUrl(filterState, tabId);
}

function buildCurrentAnimeListUrl() {
	const params = new URLSearchParams();
	if (data.search) params.set("search", data.search);
	if (data.genres?.length) params.set("genres", data.genres.join(","));
	else if (data.genre) params.set("genre", data.genre);
	if (data.broadcastYear) params.set("year", data.broadcastYear);
	if (data.broadcastSeasons?.length) params.set("seasons", data.broadcastSeasons.join(","));
	else if (data.broadcastSeason) params.set("season", data.broadcastSeason);
	if (data.studio) params.set("studio", data.studio);
	if (data.producer) params.set("producer", data.producer);
	if (data.source) params.set("source", data.source);
	if (data.tab && data.tab !== "popular") params.set("tab", data.tab);
	const qs = params.toString();
	return qs ? `/anime?${qs}` : "/anime";
}

function buildAnimeDetailUrl(animeId: string | number) {
	const listUrl = buildCurrentAnimeListUrl();
	return listUrl === "/anime" ? `/anime/${animeId}` : `/anime/${animeId}?from=${encodeURIComponent(listUrl)}`;
}

function syncFiltersToUrl(filters: AnimeFilterState) {
	goto(buildAnimeFilterUrl(filters), { keepFocus: true, noScroll: true });
}

function updateFilterState(patch: Partial<AnimeFilterState>) {
	const next = { ...filterState, ...patch };
	filterState = next;
	syncFiltersToUrl(next);
}

let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined;
function updateFilterStateDebounced(patch: Partial<AnimeFilterState>) {
	filterState = { ...filterState, ...patch };
	clearTimeout(filterDebounceTimer);
	filterDebounceTimer = setTimeout(() => syncFiltersToUrl(filterState), 400);
}

function toggleSidebarGenre(genre: string) {
	const genres = filterState.genres.includes(genre)
		? filterState.genres.filter((selected) => selected !== genre)
		: [...filterState.genres, genre];
	updateFilterState({ genres });
}

function toggleSeasonSelection(seasons: ActiveSeasonChip[], season: ActiveSeasonChip) {
	return seasons.includes(season) ? seasons.filter((selected) => selected !== season) : [...seasons, season];
}

function toggleSidebarSeason(season: ActiveSeasonChip) {
	updateFilterState({ seasons: toggleSeasonSelection(filterState.seasons, season) });
}

function clearSidebarFilters() {
	filterState = { search: "", genres: [], year: "", seasons: [], studio: "", producer: "", source: "" };
	goto("/anime", { keepFocus: true, noScroll: true });
}

$effect(() => {
	const next = toFilterState();
	const nextKey = [
		next.search,
		next.genres.join(","),
		next.year,
		next.seasons.join(","),
		next.studio,
		next.producer,
		next.source,
	].join("\u0000");
	if (previousDataFilterKey !== nextKey) {
		previousDataFilterKey = nextKey;
		filterState = next;
	}
});

/** 現在のフィルター/タブを保ったまま page=N を付けた一覧URLを組み立てる（page 1 は付けない） */
function buildAnimePageUrl(pageIndex: number): string {
	const base = buildCurrentAnimeListUrl();
	if (pageIndex <= 0) return base;
	const sep = base.includes("?") ? "&" : "?";
	return `${base}${sep}page=${pageIndex + 1}`;
}

function goToAnimePage(pageIndex: number) {
	const clamped = Math.min(Math.max(pageIndex, 0), Math.max(totalPages - 1, 0));
	if (clamped === currentAnimeSectionIndex) return;
	goto(buildAnimePageUrl(clamped));
}

/** ページャに表示するページ番号（0基点）とその件数レンジを返す */
function getVisibleAnimeSectionPages(pageCount: number, currentIndex: number, visibleCount: number) {
	const maxStart = Math.max(pageCount - visibleCount, 0);
	const sideCount = Math.floor(visibleCount / 2);
	const start = Math.min(Math.max(currentIndex - sideCount, 0), maxStart);
	const end = Math.min(start + visibleCount, pageCount);
	const pages: { index: number; rangeStart: number; rangeEnd: number }[] = [];
	for (let index = start; index < end; index += 1) {
		pages.push({
			index,
			rangeStart: index * pageSize,
			rangeEnd: Math.min((index + 1) * pageSize, data.total ?? data.animes.length),
		});
	}
	return pages;
}

function openQuickAdd(e: MouseEvent, anime: AnimeListItem) {
	e.preventDefault();
	e.stopPropagation();
	quickAddAnime = anime;
}

function closeQuickAdd() {
	quickAddAnime = null;
}

$effect(() => {
	if (!quickAddAnime) return;
	const handler = (e: KeyboardEvent) => {
		if (e.key === "Escape") closeQuickAdd();
	};
	window.addEventListener("keydown", handler);
	return () => window.removeEventListener("keydown", handler);
});

function openFilterSheet() {
	pendingGenreMap = buildGenreMap(data.genres ?? data.genre?.split(",").filter(Boolean) ?? []);
	pendingYear = data.broadcastYear ?? "";
	pendingSeasons = data.broadcastSeasons ?? (data.broadcastSeason ? [data.broadcastSeason as ActiveSeasonChip] : []);
	pendingStudio = data.studio ?? "";
	pendingProducer = data.producer ?? "";
	pendingSource = data.source ?? "";
	filterSheetOpen = true;
}

function closeFilterSheet() {
	filterSheetOpen = false;
}

function clearPendingFilters() {
	pendingGenreMap = buildGenreMap([]);
	pendingYear = "";
	pendingSeasons = [];
	pendingStudio = "";
	pendingProducer = "";
	pendingSource = "";
}

function togglePendingGenre(genre: string) {
	pendingGenreMap = {
		...pendingGenreMap,
		[genre]: !pendingGenreMap[genre],
	};
}

function togglePendingSeason(season: ActiveSeasonChip) {
	pendingSeasons = toggleSeasonSelection(pendingSeasons, season);
}

function applyFilters() {
	const params = new URLSearchParams();
	if (data.search) params.set("search", data.search);
	const selectedGenres = Object.keys(pendingGenreMap).filter((k) => pendingGenreMap[k]);
	if (selectedGenres.length) params.set("genres", selectedGenres.join(","));
	if (pendingYear) params.set("year", pendingYear);
	if (pendingSeasons.length) params.set("seasons", pendingSeasons.join(","));
	if (pendingStudio) params.set("studio", pendingStudio);
	if (pendingProducer) params.set("producer", pendingProducer);
	if (pendingSource) params.set("source", pendingSource);
	if (data.tab && data.tab !== "popular") params.set("tab", data.tab);
	const qs = params.toString();
	goto(qs ? `/anime?${qs}` : "/anime", { keepFocus: true, noScroll: true });
	closeFilterSheet();
}

$effect(() => {
	if (!filterSheetOpen) return;
	const handler = (e: KeyboardEvent) => {
		if (e.key === "Escape") closeFilterSheet();
	};
	window.addEventListener("keydown", handler);
	return () => window.removeEventListener("keydown", handler);
});

$effect(() => {
	const gMap = pendingGenreMap;
	const y = pendingYear;
	const seasons = pendingSeasons;
	const st = pendingStudio;
	const pr = pendingProducer;
	const src = pendingSource;
	if (!filterSheetOpen) return;

	sheetCountLoading = true;
	const controller = new AbortController();

	const timer = setTimeout(async () => {
		const params = new URLSearchParams();
		const gList = Object.keys(gMap).filter((k) => gMap[k]);
		if (gList.length) params.set("genres", gList.join(","));
		if (y) params.set("year", y);
		if (seasons.length) params.set("seasons", seasons.join(","));
		if (st) params.set("studio", st);
		if (pr) params.set("producer", pr);
		if (src) params.set("source", src);
		if (data.search) params.set("search", data.search);
		try {
			const res = await fetch(`/api/anime/count?${params.toString()}`, { signal: controller.signal });
			const json = await res.json();
			sheetResultCount = json.count ?? null;
		} catch {
			// aborted or failed
		} finally {
			sheetCountLoading = false;
		}
	}, 400);

	return () => {
		clearTimeout(timer);
		controller.abort();
	};
});

function isAiringToday(anime: AnimeListItem): boolean {
	if (anime.broadcast_day == null || anime.computed_broadcast_status !== "airing") return false;
	const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
	// Before 4 AM is still part of the previous broadcast night (26時制)
	const broadcastDay = now.getUTCHours() < 4 ? (now.getUTCDay() + 6) % 7 : now.getUTCDay();
	return anime.broadcast_day === broadcastDay;
}
</script>

<svelte:head> <title>アニメ — Anipolis</title> </svelte:head>

<div class="anime-page-wrap">
	<main class="anime-main">
		<section class="filter-drawer-shell" aria-label="アニメ検索と絞り込み">
			<div class="filter-drawer-bar">
				<label class="sr-only" for="desktop-anime-search">タイトル検索</label>
				<div class="search-input-wrap">
					<svg
						class="search-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.35-4.35" />
					</svg>
					<input
						id="desktop-anime-search"
						type="text"
						class="search-input"
						placeholder="タイトルで検索..."
						value={filterState.search}
						oninput={(e) => updateFilterState({ search: e.currentTarget.value })}
					>
				</div>
				<button
					type="button"
					class="filter-drawer-toggle"
					class:filter-drawer-toggle--active={filterDrawerOpen || hasActiveFilters}
					aria-expanded={filterDrawerOpen}
					aria-controls="anime-filter-drawer-panel"
					onclick={() => {
						filterDrawerOpen = !filterDrawerOpen;
					}}
				>
					<span>詳細フィルター</span>
					<svg
						class:filter-drawer-chevron--open={filterDrawerOpen}
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</button>
			</div>

			<div
				id="anime-filter-drawer-panel"
				class="filter-drawer-panel"
				class:filter-drawer-panel--open={filterDrawerOpen}
				aria-hidden={!filterDrawerOpen}
			>
				<div class="filter-drawer-inner">
					<div class="filter-drawer-grid">
						<section class="filter-drawer-column filter-drawer-column--genres">
							<h2 class="filter-drawer-heading">ジャンル</h2>
							<div class="drawer-genre-grid">
								{#each GENRES as g}
									<button
										type="button"
										class="genre-chip drawer-genre-chip"
										class:genre-chip--active={filterState.genres.includes(g)}
										aria-pressed={filterState.genres.includes(g)}
										onclick={() => toggleSidebarGenre(g)}
									>
										{g}
									</button>
								{/each}
							</div>
						</section>

						<section class="filter-drawer-column">
							<h2 class="filter-drawer-heading">放送年</h2>
							<label class="sr-only" for="desktop-anime-year">放送年</label>
							<div class="filter-year-wrap">
								<input
									id="desktop-anime-year"
									type="number"
									min="1900"
									max="2100"
									class="filter-input"
									placeholder="例: 2025"
									value={filterState.year}
									oninput={(e) => updateFilterState({ year: e.currentTarget.value })}
								>
								<button
									type="button"
									class="filter-year-today-btn"
									onclick={() => updateFilterState({ year: String(new Date().getFullYear()) })}
								>
									今年
								</button>
							</div>
						</section>

						<section class="filter-drawer-column">
							<h2 class="filter-drawer-heading">放送シーズン</h2>
							<div class="season-chips">
								{#each SEASON_CHIPS as s}
									<button
										type="button"
										class="season-chip"
										class:season-chip--active={filterState.seasons.includes(s)}
										aria-pressed={filterState.seasons.includes(s)}
										onclick={() => toggleSidebarSeason(s)}
									>
										{s}
									</button>
								{/each}
							</div>
						</section>

						<section class="filter-drawer-column">
							<h2 class="filter-drawer-heading">スタジオ</h2>
							<label class="sr-only" for="desktop-anime-studio">スタジオ</label>
							<input
								id="desktop-anime-studio"
								type="text"
								class="filter-input"
								placeholder="スタジオ名"
								value={filterState.studio}
								oninput={(e) => updateFilterStateDebounced({ studio: e.currentTarget.value })}
							>
						</section>

						<section class="filter-drawer-column">
							<h2 class="filter-drawer-heading">原作</h2>
							<label class="sr-only" for="desktop-anime-source">原作</label>
							<select
								id="desktop-anime-source"
								class="filter-select"
								value={filterState.source}
								onchange={(e) => updateFilterState({ source: e.currentTarget.value })}
							>
								<option value="">すべて</option>
								{#each SOURCE_OPTIONS as source}
									<option value={source}>{source}</option>
								{/each}
							</select>
						</section>

						<div class="filter-drawer-column filter-drawer-column--clear">
							<button
								type="button"
								class="filter-drawer-clear"
								onclick={clearSidebarFilters}
								disabled={!hasActiveFilters}
							>
								フィルターをクリア
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>

		<form method="GET" action="/anime" class="search-form search-form--mobile">
			<div class="search-row">
				<div class="search-input-wrap">
					<svg
						class="search-icon"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.35-4.35" />
					</svg>
					<input
						type="text"
						name="search"
						class="search-input"
						placeholder="タイトルで検索..."
						value={data.search ?? ''}
					>
				</div>
				<button type="submit" class="search-btn">検索</button>
				<button
					type="button"
					class="filter-icon-btn"
					class:filter-icon-btn--active={hasActiveFilters}
					onclick={openFilterSheet}
					aria-label="フィルターを開く"
					title="フィルター"
				>
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
					</svg>
					{#if hasActiveFilters}
						<span class="filter-active-dot" aria-hidden="true"></span>
					{/if}
				</button>
				{#if data.search || data.genre || data.season || data.broadcastYear || data.broadcastSeason || data.broadcastSeasons?.length || data.studio || data.producer || data.source}
					<a href="/anime" class="search-clear" title="フィルターをすべてクリア">✕</a>
				{/if}
			</div>
		</form>

		<nav class="tab-nav">
			{#each tabs as tab}
				{#if tab.id !== 'mylist' || data.user}
					<a href={buildAnimeTabUrl(tab.id)} class="tab-btn" class:active={data.tab === tab.id}
						>{tab.label}</a
					>
				{/if}
			{/each}
			{#if data.isAdmin}
				<a
					href={buildAnimeTabUrl('register')}
					class="tab-btn tab-btn--add"
					class:active={data.tab === 'register'}
					>＋登録</a
				>
			{/if}
		</nav>

		{#if data.search}
			<p class="search-label">「{data.search}」の検索結果 — {data.total ?? data.animes.length}件</p>
		{:else if data.genre}
			<p class="search-label">
				ジャンル：<strong>{data.genre}</strong>
				— {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.season}
			<p class="search-label">
				シーズン：<strong>{data.season}</strong>
				— {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.broadcastYear || data.broadcastSeason || data.broadcastSeasons?.length}
			<p class="search-label">
				放送時期：<strong
					>{[data.broadcastYear, ...(data.broadcastSeasons?.length ? data.broadcastSeasons : [data.broadcastSeason])].filter(Boolean).join(' ')}</strong
				>
				／ {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.studio}
			<p class="search-label">
				スタジオ：<strong>{data.studio}</strong>
				— {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.producer}
			<p class="search-label">
				制作：<strong>{data.producer}</strong>
				— {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.source}
			<p class="search-label">
				原作：<strong>{data.source}</strong>
				— {data.total ?? data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{/if}

		{#if data.tab === 'register' && data.isAdmin}
			<AnimeRegisterForm {form} />
		{:else if data.tab === 'register'}
			<div class="anime-grid anime-grid--empty">
				<div class="empty-state">
					<p>管理者権限が必要です</p>
				</div>
			</div>
		{:else if data.tab === 'mylist' && !data.user}
			<div class="anime-grid anime-grid--empty">
				<div class="empty-state">
					<p>マイリストを見るにはログインが必要です</p>
				</div>
			</div>
		{:else if data.animes.length === 0}
			<div class="anime-grid anime-grid--empty">
				<div class="empty-state">
					<p>アニメが見つかりません</p>
				</div>
			</div>
		{:else}
			<div class="anime-list-surface">
				<div class="anime-grid">
					{#each data.animes as anime, sectionItemIndex}
						{@const rankIndex = pageStartRank + sectionItemIndex}
						<a href={buildAnimeDetailUrl(anime.id)} class="anime-card">
							<div class="anime-cover">
								{#if anime.cover_url}
									<img src={anime.cover_url ?? ''} alt={anime.title} loading="lazy">
								{:else}
									<div class="anime-cover-placeholder">
										<svg
											width="32"
											height="32"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											aria-hidden="true"
										>
											<rect x="2" y="2" width="20" height="20" rx="2" />
											<path d="M10 8l6 4-6 4V8z" />
										</svg>
									</div>
								{/if}
								{#if data.tab === 'popular' || data.tab === 'trending' || data.tab === 'top_rated'}
									<span class="rank-badge">#{rankIndex + 1}</span>
								{/if}
								{#if isAiringToday(anime)}
									<span class="airing-today-badge">本日放送</span>
								{/if}
								{#if data.user}
									<button
										type="button"
										class="quick-add-btn"
										class:in-list={anime.user_entry}
										onclick={(e) => openQuickAdd(e, anime)}
										aria-label={anime.user_entry ? statusLabels[anime.user_entry.status as AnimeStatus] : 'マイリストに追加'}
										title={anime.user_entry ? statusLabels[anime.user_entry.status as AnimeStatus] : 'マイリストに追加'}
									>
										{#if anime.user_entry}
											<svg
												width="13"
												height="13"
												viewBox="0 0 24 24"
												fill="currentColor"
												aria-hidden="true"
											>
												<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
											</svg>
										{:else}
											<svg
												width="13"
												height="13"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2.5"
												aria-hidden="true"
											>
												<path d="M12 5v14M5 12h14" />
											</svg>
										{/if}
									</button>
								{/if}
							</div>
							<div class="anime-info">
								<p class="anime-title">{anime.title}</p>
								<p
									class="anime-title-en"
									class:anime-title-en--placeholder={!anime.title_en}
									aria-hidden={anime.title_en ? undefined : "true"}
								>
									{anime.title_en ?? '\u00A0'}
								</p>
								<div class="anime-meta">
									<div class="anime-status-slot">
										<span class="anime-status-badge status-{anime.computed_broadcast_status}"
											>{animeStatusBadge(anime)}</span
										>
									</div>
									<span
										class="anime-season"
										class:anime-season--placeholder={!anime.season}
										aria-hidden={anime.season ? undefined : "true"}
									>
										{anime.season ?? '\u00A0'}
										{#if anime.type && anime.type !== 'TV'}
											<span class="anime-type-badge">{anime.type}</span>
										{/if}
									</span>
								</div>
								<div class="mylist-badge-slot">
									{#if anime.user_entry}
										<span class="mylist-badge"
											>{statusLabels[anime.user_entry.status as AnimeStatus]}</span
										>
									{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>

				{#if totalPages > 1}
					<nav class="anime-section-bar" aria-label="50件ごとの表示切り替え">
						<button
							type="button"
							class="anime-section-control"
							onclick={() => goToAnimePage(0)}
							disabled={currentAnimeSectionIndex === 0}
							aria-label="最初の50件"
						>
							<span aria-hidden="true">«</span>
						</button>
						<button
							type="button"
							class="anime-section-control"
							onclick={() => goToAnimePage(currentAnimeSectionIndex - 1)}
							disabled={currentAnimeSectionIndex === 0}
							aria-label="前の50件"
						>
							<span aria-hidden="true">‹</span>
						</button>
						{#each visibleAnimeSectionPages as page}
							<button
								type="button"
								class="anime-section-page anime-section-page--desktop"
								class:active={currentAnimeSectionIndex === page.index}
								onclick={() => goToAnimePage(page.index)}
								aria-label={`${page.rangeStart + 1}-${page.rangeEnd}件を表示`}
								aria-current={currentAnimeSectionIndex === page.index ? 'page' : undefined}
							>
								{page.index + 1}
							</button>
						{/each}
						{#each visibleMobileAnimeSectionPages as page}
							<button
								type="button"
								class="anime-section-page anime-section-page--mobile"
								class:active={currentAnimeSectionIndex === page.index}
								onclick={() => goToAnimePage(page.index)}
								aria-label={`${page.rangeStart + 1}-${page.rangeEnd}件を表示`}
								aria-current={currentAnimeSectionIndex === page.index ? 'page' : undefined}
							>
								{page.index + 1}
							</button>
						{/each}
						<button
							type="button"
							class="anime-section-control"
							onclick={() => goToAnimePage(currentAnimeSectionIndex + 1)}
							disabled={currentAnimeSectionIndex === totalPages - 1}
							aria-label="次の50件"
						>
							<span aria-hidden="true">›</span>
						</button>
						<button
							type="button"
							class="anime-section-control"
							onclick={() => goToAnimePage(totalPages - 1)}
							disabled={currentAnimeSectionIndex === totalPages - 1}
							aria-label="最後の50件"
						>
							<span aria-hidden="true">»</span>
						</button>
					</nav>
				{/if}
			</div>
		{/if}
	</main>

	{#if quickAddAnime && data.user}
		<MyListModal
			open
			animeId={quickAddAnime.id}
			animeTitle={quickAddAnime.title}
			episodeCount={quickAddAnime.episode_count}
			entry={quickAddAnime.user_entry}
			onclose={closeQuickAdd}
		/>
	{/if}

	{#if filterSheetOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="filter-sheet-overlay" role="presentation" onclick={closeFilterSheet}>
			<div
				class="filter-sheet"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="フィルター"
				tabindex="-1"
			>
				<div class="filter-sheet-header">
					<span class="filter-sheet-title">フィルター</span>
					<button type="button" class="filter-sheet-close" onclick={closeFilterSheet} aria-label="閉じる">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>

				<div class="filter-sheet-body">
					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">ジャンル</h3>
						<div class="genre-chips">
							{#each GENRES as g}
								<button
									type="button"
									class="genre-chip"
									class:genre-chip--active={pendingGenreMap[g]}
									aria-pressed={pendingGenreMap[g]}
									onclick={() => togglePendingGenre(g)}
								>
									{g}
								</button>
							{/each}
						</div>
					</section>

					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">放送年</h3>
						<div class="filter-year-wrap">
							<input
								type="number"
								min="1900"
								max="2100"
								class="filter-sheet-input"
								placeholder="例: 2025"
								bind:value={pendingYear}
							>
							<button
								type="button"
								class="filter-year-today-btn"
								onclick={() => {
									pendingYear = String(new Date().getFullYear());
								}}
							>
								今年
							</button>
						</div>
					</section>

					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">放送シーズン</h3>
						<div class="season-chips">
							{#each SEASON_CHIPS as s}
								<button
									type="button"
									class="season-chip"
									class:season-chip--active={pendingSeasons.includes(s)}
									aria-pressed={pendingSeasons.includes(s)}
									onclick={() => togglePendingSeason(s)}
								>
									{s}
								</button>
							{/each}
						</div>
					</section>

					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">スタジオ</h3>
						<input
							type="text"
							class="filter-sheet-input"
							placeholder="スタジオ名"
							bind:value={pendingStudio}
						>
					</section>

					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">原作</h3>
						<select class="filter-sheet-input" bind:value={pendingSource}>
							<option value="">すべて</option>
							{#each SOURCE_OPTIONS as source}
								<option value={source}>{source}</option>
							{/each}
						</select>
					</section>

					<button type="button" class="filter-sheet-clear" onclick={clearPendingFilters}>
						フィルターをクリア
					</button>
				</div>

				<div class="filter-sheet-footer">
					<button type="button" class="filter-sheet-apply" onclick={applyFilters}>
						{#if sheetCountLoading}
							検索中...
						{:else if sheetResultCount !== null}
							この条件で検索（{sheetResultCount}件ヒット）
						{:else}
							この条件で検索
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
.anime-page-wrap {
	width: 100%;
	max-width: 1360px;
	margin: 0 auto;
	padding: 24px 16px 0;
	box-sizing: border-box;
}
.anime-main {
	width: 100%;
	min-width: 0;
}
.filter-drawer-shell {
	margin: 0 0 16px;
}
.filter-drawer-bar {
	display: flex;
	align-items: center;
	gap: 10px;
}
.filter-drawer-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	flex: 0 0 auto;
	min-height: 38px;
	padding: 0 14px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	white-space: nowrap;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s,
		box-shadow 0.15s;
}
.filter-drawer-toggle:hover {
	background: var(--hover-bg);
	border-color: var(--color-border-hover);
}
.filter-drawer-toggle--active {
	border-color: var(--accent);
	color: var(--accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
}
.filter-drawer-toggle svg {
	transition: transform 0.2s;
}
.filter-drawer-chevron--open {
	transform: rotate(180deg);
}
.filter-drawer-panel {
	max-height: 0;
	opacity: 0;
	overflow: hidden;
	transform: translateY(-6px);
	transition:
		max-height 0.3s ease,
		opacity 0.25s ease,
		transform 0.3s ease,
		margin-top 0.3s ease;
}
.filter-drawer-panel--open {
	max-height: min(70dvh, 640px);
	opacity: 1;
	transform: translateY(0);
	margin-top: 10px;
	overflow-y: auto;
}
.filter-drawer-inner {
	--filter-drawer-control-height: 46px;
	padding: 16px;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--card-bg);
	box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
	box-sizing: border-box;
}
.filter-drawer-grid {
	display: grid;
	grid-template-columns: repeat(12, minmax(0, 1fr));
	gap: 16px 18px;
	align-items: start;
}
.filter-drawer-column {
	min-width: 0;
}
.filter-drawer-column--genres {
	grid-column: 1 / -1;
}
.filter-drawer-column:not(.filter-drawer-column--genres):not(.filter-drawer-column--clear) {
	grid-column: span 2;
}
.filter-drawer-column--clear {
	grid-column: span 2;
	align-self: end;
}
.filter-drawer-heading {
	margin: 0 0 10px;
	color: var(--text-muted);
	font-size: 0.74rem;
	font-weight: 700;
	letter-spacing: 0.05em;
	text-transform: uppercase;
}
.drawer-genre-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	gap: 7px;
}
.drawer-genre-chip {
	min-height: 30px;
	padding: 6px 9px;
	font-size: 0.78rem;
}
.filter-drawer-clear {
	width: 100%;
	padding: 8px 13px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: transparent;
	color: var(--text-muted);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s,
		border-color 0.12s;
}
.filter-drawer-clear:hover:not(:disabled) {
	background: var(--hover-bg);
	color: var(--text);
	border-color: var(--color-border-hover);
}
.filter-drawer-clear:disabled {
	opacity: 0.45;
	cursor: default;
}
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.search-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-bottom: 16px;
}
.search-form--mobile {
	display: none;
}
.search-row {
	display: flex;
	gap: 8px;
	align-items: center;
}
.search-input-wrap {
	position: relative;
	flex: 1;
}
.search-icon {
	position: absolute;
	left: 10px;
	top: 50%;
	transform: translateY(-50%);
	color: var(--color-text-muted);
	pointer-events: none;
}
.search-input {
	width: 100%;
	padding: 9px 12px 9px 34px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	color: var(--color-text);
	font-size: 0.9rem;
	outline: none;
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
	box-sizing: border-box;
}
.search-input:focus {
	border-color: var(--color-accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}
.search-input:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
.search-btn {
	padding: 9px 18px;
	border-radius: 8px;
	background: var(--color-accent);
	color: #fff;
	border: none;
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
	white-space: nowrap;
}
.search-btn:hover {
	opacity: 0.85;
}
.search-clear {
	padding: 7px 11px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	text-decoration: none;
	font-size: 0.85rem;
	transition:
		background 0.15s,
		color 0.15s;
	line-height: 1;
}
.search-clear:hover {
	background: var(--color-surface-hover);
	color: var(--color-text);
}

.filter-row {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	align-items: flex-end;
	padding: 10px 12px;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 8px;
}
.filter-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1 1 140px;
	min-width: 120px;
	max-width: 220px;
}
.filter-group--year {
	flex: 0 1 160px;
}
.filter-year-wrap {
	display: flex;
	gap: 4px;
	align-items: stretch;
}
.filter-year-today-btn {
	padding: 7px 8px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
	font-size: 0.78rem;
	cursor: pointer;
	white-space: nowrap;
	transition: background 0.12s;
}
.filter-year-today-btn:hover {
	background: var(--color-accent);
	color: #fff;
	border-color: var(--color-accent);
}
.filter-group--reset {
	flex: 0 0 auto;
	min-width: unset;
	justify-content: flex-end;
}
.filter-reset-btn {
	padding: 7px 12px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	text-decoration: none;
	font-size: 0.82rem;
	white-space: nowrap;
	transition: background 0.12s;
}
.filter-reset-btn:hover {
	background: var(--color-surface-hover);
}
.filter-label {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--color-text-muted);
	letter-spacing: 0.02em;
}
.filter-select,
.filter-input {
	padding: 7px 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 0.85rem;
	outline: none;
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
	width: 100%;
	box-sizing: border-box;
}
.filter-select:focus,
.filter-input:focus {
	border-color: var(--color-accent);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 15%, transparent);
}
.filter-year-wrap .filter-input {
	flex: 1;
	min-width: 0;
}
.filter-select:focus-visible,
.filter-input:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

.filter-clear {
	margin-left: 6px;
	padding: 2px 7px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	text-decoration: none;
	font-size: 0.8rem;
}
.filter-clear:hover {
	background: var(--color-surface-hover);
}
.search-label {
	font-size: 0.85rem;
	color: var(--color-text-muted);
	margin-bottom: 12px;
}

.tab-nav {
	display: flex;
	gap: 4px;
	margin-bottom: 20px;
	flex-wrap: wrap;
}
.tab-btn {
	padding: 6px 14px;
	border-radius: 20px;
	font-size: 0.85rem;
	color: var(--text-secondary);
	text-decoration: none;
	border: 1.5px solid var(--color-border-hover);
	transition: all 0.15s;
	font-weight: 500;
}
.tab-btn:hover {
	background: var(--hover-bg);
	color: var(--text);
	border-color: var(--color-accent);
}
.tab-btn.active {
	background: var(--color-accent);
	color: #fff;
	border-color: var(--color-accent);
}
.tab-btn.active:hover {
	background: var(--color-accent-hover);
	border-color: var(--color-accent-hover);
}

.anime-list-surface {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 100%;
	min-width: 0;
}

.anime-section-bar {
	display: inline-flex;
	max-width: 100%;
	margin-top: 18px;
	overflow-x: auto;
	border: 1px solid var(--border);
	border-radius: 999px;
	background: color-mix(in srgb, var(--card-bg) 86%, var(--hover-bg));
	box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
	vertical-align: top;
	scrollbar-width: none;
}

.anime-section-bar::-webkit-scrollbar {
	display: none;
}

.anime-section-control,
.anime-section-page {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 44px;
	width: 44px;
	height: 44px;
	padding: 0;
	border: 0;
	border-right: 1px solid var(--border);
	background: transparent;
	color: var(--text);
	font-size: 0.94rem;
	line-height: 1;
	cursor: pointer;
	transition:
		background 0.15s,
		color 0.15s;
}

.anime-section-control:first-child {
	border-top-left-radius: 999px;
	border-bottom-left-radius: 999px;
}

.anime-section-control:last-child {
	border-right: 0;
	border-top-right-radius: 999px;
	border-bottom-right-radius: 999px;
}

.anime-section-control {
	color: var(--text-muted);
	font-size: 1.4rem;
	font-weight: 700;
}

.anime-section-page {
	font-weight: 600;
}

.anime-section-page--mobile {
	display: none;
}

.anime-section-control:hover:not(:disabled),
.anime-section-page:hover {
	background: var(--hover-bg);
	color: var(--text);
}

.anime-section-page.active {
	background: color-mix(in srgb, var(--accent) 24%, var(--hover-bg));
	color: var(--text);
}

.anime-section-control:disabled {
	color: color-mix(in srgb, var(--text-muted) 42%, transparent);
	cursor: default;
}

.anime-grid {
	display: grid;
	align-self: stretch;
	width: 100%;
	min-width: 0;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 14px;
}

@media (max-width: 1180px) {
	.anime-grid {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
}

@media (max-width: 768px) {
	.anime-list-surface {
		padding-bottom: calc(72px + env(safe-area-inset-bottom));
	}

	.anime-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.anime-section-bar {
		max-width: 100%;
		margin-top: 16px;
	}

	.anime-section-control,
	.anime-section-page {
		flex-basis: 36px;
		width: 36px;
		height: 38px;
		font-size: 0.86rem;
	}

	.anime-section-control {
		font-size: 1.2rem;
	}

	.anime-section-page--desktop {
		display: none;
	}

	.anime-section-page--mobile {
		display: inline-flex;
	}
}

@media (max-width: 420px) {
	.anime-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 768px) and (orientation: landscape) {
	.anime-list-surface {
		padding-bottom: 0;
	}
}
.anime-card {
	display: flex;
	flex-direction: column;
	text-decoration: none;
	color: var(--color-text);
	border-radius: 8px;
	overflow: hidden;
	border: 1px solid var(--color-border);
	transition:
		border-color 0.15s,
		transform 0.15s;
}
.anime-card:hover {
	border-color: var(--color-accent);
	transform: translateY(-2px);
}

.anime-cover {
	position: relative;
	aspect-ratio: 1 / 1.414;
	background: var(--color-surface);
	overflow: hidden;
}
.anime-cover img {
	width: 100%;
	display: block;
	image-rendering: auto;
}
.anime-cover-placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--color-text-muted);
	background: var(--color-surface-hover);
}
.rank-badge {
	position: absolute;
	top: 6px;
	left: 6px;
	background: rgba(0, 0, 0, 0.7);
	color: #fff;
	font-size: 0.75rem;
	font-weight: 700;
	padding: 2px 6px;
	border-radius: 4px;
}

.anime-info {
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
}
.anime-title {
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.3;
	height: calc(0.85rem * 1.3 * 2);
	margin: 0;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.anime-title-en {
	font-size: 0.72rem;
	line-height: 1.2;
	height: calc(0.72rem * 1.2);
	color: var(--text-muted);
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.anime-title-en--placeholder {
	visibility: hidden;
}
.anime-meta {
	display: grid;
	grid-template-rows: repeat(2, calc(0.72rem * 1.6 + 2px));
	gap: 4px;
	min-width: 0;
}
.anime-status-slot {
	display: flex;
	align-items: flex-start;
	min-width: 0;
}
.anime-status-badge {
	font-size: 0.7rem;
	padding: 1px 5px;
	border-radius: 3px;
	font-weight: 600;
	line-height: 1.6;
	white-space: nowrap;
}
.status-airing {
	background: color-mix(in srgb, var(--status-watching) 15%, transparent);
	color: var(--status-watching);
}
.status-upcoming {
	background: color-mix(in srgb, var(--status-plan) 15%, transparent);
	color: var(--status-plan);
}
.status-finished {
	background: var(--color-surface-hover);
	color: var(--color-text-muted);
}
.status-unknown {
	background: var(--color-surface);
	color: var(--color-text-muted);
}

.airing-today-badge {
	position: absolute;
	top: 6px;
	right: 6px;
	font-size: 0.7rem;
	font-weight: 700;
	padding: 3px 6px;
	border-radius: 4px;
	background: #ef4444;
	color: #fff;
	letter-spacing: 0.02em;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.anime-season {
	font-size: 0.72rem;
	line-height: 1.6;
	color: var(--color-text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
/* 同一シーズンに同名のTV版とSpecial/ONA版が並ぶことがあるため、非TVは媒体を明示 */
.anime-type-badge {
	margin-left: 4px;
	padding: 0 4px;
	border: 1px solid var(--color-border);
	border-radius: 3px;
	font-size: 0.62rem;
	color: var(--color-text-muted);
	white-space: nowrap;
}
.anime-season--placeholder {
	visibility: hidden;
}
.mylist-badge-slot {
	display: flex;
	align-items: flex-start;
	height: calc(0.7rem * 1.6 + 2px);
}
.mylist-badge {
	font-size: 0.7rem;
	line-height: 1.6;
	padding: 1px 5px;
	border-radius: 3px;
	background: var(--accent-muted, #19448e22);
	color: var(--accent);
	width: fit-content;
	white-space: nowrap;
}

.empty-state {
	text-align: center;
	padding: 60px 20px;
	color: var(--color-text-muted);
}

.anime-grid--empty .empty-state {
	grid-column: 1 / -1;
}

/* ─── 登録タブ ─── */
.tab-btn--add {
	color: var(--color-accent);
	font-weight: 600;
}
.tab-btn--add.active {
	background: var(--color-accent);
	color: #fff;
}

/* ─── マイリスト追加ボタン（カバー上オーバーレイ） ─── */
.quick-add-btn {
	position: absolute;
	bottom: 6px;
	right: 6px;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.6);
	color: #fff;
	border: 1.5px solid rgba(255, 255, 255, 0.4);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition:
		background 0.15s,
		border-color 0.15s,
		transform 0.15s;
	padding: 0;
	backdrop-filter: blur(4px);
}
.quick-add-btn:hover {
	background: var(--color-accent);
	border-color: var(--color-accent);
	transform: scale(1.1);
}
.quick-add-btn.in-list {
	background: color-mix(in srgb, var(--status-completed) 78%, transparent);
	border-color: var(--status-completed);
}
.quick-add-btn.in-list:hover {
	background: var(--status-completed);
}

/* ─── クイック追加モーダル ─── */
/* ─── フィルターアイコンボタン ─── */
.filter-icon-btn {
	display: none;
	position: relative;
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	cursor: pointer;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	transition:
		background 0.15s,
		border-color 0.15s,
		color 0.15s;
}
.filter-icon-btn:hover {
	background: var(--hover-bg);
}
.filter-icon-btn--active {
	border-color: var(--accent);
	color: var(--accent);
}
.filter-active-dot {
	position: absolute;
	top: 5px;
	right: 5px;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--accent);
}

/* ─── フィルターボトムシート ─── */
.filter-sheet-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	z-index: 1100;
	display: flex;
	align-items: flex-end;
	backdrop-filter: blur(2px);
	animation: overlay-fadein 0.2s ease;
}
@keyframes overlay-fadein {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}
.filter-sheet {
	background: var(--card-bg);
	border-top: 1px solid var(--border);
	border-radius: 16px 16px 0 0;
	width: 100%;
	max-height: 85dvh;
	display: flex;
	flex-direction: column;
	box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.25);
	animation: sheet-slidein 0.25s cubic-bezier(0.32, 0.72, 0, 1);
	padding-bottom: env(safe-area-inset-bottom);
}
@keyframes sheet-slidein {
	from {
		transform: translateY(100%);
	}
	to {
		transform: translateY(0);
	}
}
.filter-sheet-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px 12px;
	border-bottom: 1px solid var(--border);
	flex-shrink: 0;
}
.filter-sheet-title {
	font-size: 1rem;
	font-weight: 700;
	color: var(--text);
}
.filter-sheet-close {
	padding: 4px;
	border: none;
	background: none;
	color: var(--text-muted);
	cursor: pointer;
	border-radius: 6px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition:
		background 0.12s,
		color 0.12s;
}
.filter-sheet-close:hover {
	background: var(--hover-bg);
	color: var(--text);
}
.filter-sheet-body {
	overflow-y: auto;
	flex: 1;
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 20px;
	-webkit-overflow-scrolling: touch;
}
.filter-sheet-section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.filter-sheet-section-label {
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--text-muted);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin: 0;
}
.genre-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.genre-chip {
	padding: 5px 12px;
	border-radius: 999px;
	border: 1.5px solid var(--border);
	background: transparent;
	color: var(--text);
	font-size: 0.82rem;
	cursor: pointer;
	transition:
		background 0.12s,
		border-color 0.12s,
		color 0.12s;
	white-space: nowrap;
}
.genre-chip:hover {
	background: var(--hover-bg);
}
.genre-chip--active,
.genre-chip--active:hover,
.genre-chip--active:focus,
.genre-chip--active:focus-visible {
	background: var(--accent);
	border-color: var(--accent);
	color: #fff;
	font-weight: 600;
}
.season-chips {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
}
.season-chip {
	padding: 9px 0;
	border-radius: 8px;
	border: 1.5px solid var(--border);
	background: transparent;
	color: var(--text);
	font-size: 0.9rem;
	font-weight: 600;
	cursor: pointer;
	text-align: center;
	transition:
		background 0.12s,
		border-color 0.12s,
		color 0.12s;
}
.season-chip:hover {
	background: var(--hover-bg);
	border-color: var(--accent);
}
.season-chip--active {
	background: var(--accent);
	border-color: var(--accent);
	color: #fff;
}
.season-chip--active:hover {
	background: var(--accent);
	border-color: var(--accent);
}
.filter-drawer-inner .filter-year-wrap,
.filter-drawer-inner .season-chips {
	height: var(--filter-drawer-control-height);
}
.filter-drawer-inner .filter-input,
.filter-drawer-inner .filter-select,
.filter-drawer-inner .filter-year-today-btn,
.filter-drawer-inner .season-chip,
.filter-drawer-inner .filter-drawer-clear {
	height: var(--filter-drawer-control-height);
	box-sizing: border-box;
}
.filter-drawer-inner .filter-input,
.filter-drawer-inner .filter-select {
	padding-top: 0;
	padding-bottom: 0;
	line-height: 1.2;
}
.filter-drawer-inner .filter-year-today-btn,
.filter-drawer-inner .season-chip,
.filter-drawer-inner .filter-drawer-clear {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding-top: 0;
	padding-bottom: 0;
	line-height: 1;
}
.filter-sheet-input {
	padding: 9px 12px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--bg);
	color: var(--text);
	font-size: 0.9rem;
	outline: none;
	width: 100%;
	box-sizing: border-box;
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
}
.filter-year-wrap .filter-sheet-input {
	flex: 1;
	min-width: 0;
}
.filter-sheet-input:focus {
	border-color: var(--accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}
.filter-sheet-input:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}
.filter-sheet-clear {
	align-self: flex-start;
	padding: 6px 14px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: transparent;
	color: var(--text-muted);
	font-size: 0.82rem;
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s;
}
.filter-sheet-clear:hover {
	background: var(--hover-bg);
	color: var(--text);
}
.filter-sheet-footer {
	padding: 12px 16px;
	border-top: 1px solid var(--border);
	flex-shrink: 0;
}
.filter-sheet-apply {
	width: 100%;
	padding: 13px;
	border-radius: 10px;
	border: none;
	background: var(--accent);
	color: #fff;
	font-size: 0.95rem;
	font-weight: 700;
	cursor: pointer;
	transition: opacity 0.15s;
}
.filter-sheet-apply:hover {
	opacity: 0.88;
}

/* ─── モバイル：フィルターアイコン表示 / インラインフィルター非表示 ─── */
@media (max-width: 960px) {
	.anime-page-wrap {
		max-width: 1100px;
		padding-top: 12px;
	}
	.filter-drawer-shell {
		display: none;
	}
	.search-form--mobile {
		display: flex;
	}
	.filter-icon-btn {
		display: flex;
	}
	.filter-row--desktop {
		display: none;
	}
}
</style>
