<script lang="ts">
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import AnimeRegisterForm from "$lib/components/AnimeRegisterForm.svelte";
import type { Anime, AnimeStatus } from "$lib/types";
import type { PageProps } from "./$types";

let { data, form }: PageProps = $props();

const GENRES = [
	"アクション",
	"アドベンチャー",
	"受賞歴あり",
	"コメディ",
	"ドラマ",
	"ファンタジー",
	"ホラー",
	"ミステリー",
	"ロマンス",
	"SF",
	"スポーツ",
	"日常",
	"超自然",
	"サスペンス",
	"グルメ",
	"魔法少女",
	"メカ",
	"音楽",
	"学園",
	"歴史",
	"異世界",
	"ハーレム",
	"ボーイズラブ",
	"ガールズラブ",
	"百合",
	"心理",
	"転生",
	"吸血鬼",
	"少年向け",
	"少女向け",
	"青年向け",
	"女性向け",
	"子ども向け",
];

const tabs = [
	{ id: "popular", label: "人気" },
	{ id: "trending", label: "トレンド" },
	{ id: "top_rated", label: "高評価" },
	{ id: "airing", label: "放送中" },
	{ id: "upcoming", label: "放送予定" },
	{ id: "mylist", label: "マイリスト" },
] as const;

const ANIME_SECTION_SIZE = 50;

const statusLabels: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	dropped: "断念",
	on_hold: "一時停止",
};

function animeStatusBadge(anime: Anime): string {
	if (anime.computed_broadcast_status === "airing") return "放送中";
	if (anime.computed_broadcast_status === "upcoming") return "放送予定";
	if (anime.computed_broadcast_status === "finished") return "放送終了";
	return "未定";
}

const statusOptions: { value: AnimeStatus; label: string; color: string }[] = [
	{ value: "watching" as AnimeStatus, label: "視聴中", color: "#16a34a" },
	{ value: "completed" as AnimeStatus, label: "完了", color: "#19448e" },
	{ value: "plan_to_watch" as AnimeStatus, label: "視聴予定", color: "#2563eb" },
	{ value: "on_hold" as AnimeStatus, label: "中断", color: "#d97706" },
	{ value: "dropped" as AnimeStatus, label: "断念", color: "#dc2626" },
];

let quickAddAnime = $state<Anime | null>(null);
let quickAddSubmitting = $state(false);

// フィルターボトムシート
let filterSheetOpen = $state(false);
function buildGenreMap(selected: string[]): Record<string, boolean> {
	const set = new Set(selected);
	return Object.fromEntries(GENRES.map((g) => [g, set.has(g)]));
}
let pendingGenreMap = $state<Record<string, boolean>>(buildGenreMap(data.genre?.split(",").filter(Boolean) ?? []));
let pendingYear = $state(data.broadcastYear ?? "");
let pendingSeason = $state(data.broadcastSeason ?? "");
let pendingStudio = $state(data.studio ?? "");
let pendingProducer = $state(data.producer ?? "");
let sheetResultCount = $state<number | null>(null);
let sheetCountLoading = $state(false);
let hasActiveFilters = $derived(
	Boolean(data.genre || data.broadcastYear || data.broadcastSeason || data.studio || data.producer),
);
let currentAnimeSectionIndex = $state(0);
let animeSections = $derived(chunkAnimes(data.animes));
let currentAnimeSection = $derived(animeSections[currentAnimeSectionIndex] ?? { start: 0, end: 0, items: [] });
let visibleAnimeSectionPages = $derived(getVisibleAnimeSectionPages(animeSections, currentAnimeSectionIndex, 7));
let visibleMobileAnimeSectionPages = $derived(getVisibleAnimeSectionPages(animeSections, currentAnimeSectionIndex, 5));
let animeListContextKey = $derived(
	[
		data.tab,
		data.search,
		data.genre,
		data.season,
		data.broadcastYear,
		data.broadcastSeason,
		data.studio,
		data.producer,
	].join("\u0000"),
);
let previousAnimeListContextKey = $state<string | null>(null);

function chunkAnimes(animes: Anime[]) {
	const sections: { start: number; end: number; items: Anime[] }[] = [];
	for (let start = 0; start < animes.length; start += ANIME_SECTION_SIZE) {
		const items = animes.slice(start, start + ANIME_SECTION_SIZE);
		sections.push({ start, end: start + items.length, items });
	}
	return sections;
}

function setAnimeSectionIndex(index: number) {
	currentAnimeSectionIndex = Math.min(Math.max(index, 0), Math.max(animeSections.length - 1, 0));
}

function getVisibleAnimeSectionPages(
	sections: { start: number; end: number; items: Anime[] }[],
	currentIndex: number,
	visibleCount: number,
) {
	const maxStart = Math.max(sections.length - visibleCount, 0);
	const sideCount = Math.floor(visibleCount / 2);
	const start = Math.min(Math.max(currentIndex - sideCount, 0), maxStart);
	return sections.slice(start, start + visibleCount).map((section, offset) => ({
		section,
		index: start + offset,
	}));
}

$effect(() => {
	if (previousAnimeListContextKey === null) {
		previousAnimeListContextKey = animeListContextKey;
		return;
	}
	if (animeListContextKey !== previousAnimeListContextKey) {
		previousAnimeListContextKey = animeListContextKey;
		currentAnimeSectionIndex = 0;
	}
});

$effect(() => {
	const maxIndex = Math.max(animeSections.length - 1, 0);
	if (currentAnimeSectionIndex > maxIndex) currentAnimeSectionIndex = maxIndex;
});

function openQuickAdd(e: MouseEvent, anime: Anime) {
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
	pendingGenreMap = buildGenreMap(data.genre?.split(",").filter(Boolean) ?? []);
	pendingYear = data.broadcastYear ?? "";
	pendingSeason = data.broadcastSeason ?? "";
	pendingStudio = data.studio ?? "";
	pendingProducer = data.producer ?? "";
	filterSheetOpen = true;
}

function closeFilterSheet() {
	filterSheetOpen = false;
}

function clearPendingFilters() {
	pendingGenreMap = buildGenreMap([]);
	pendingYear = "";
	pendingSeason = "";
	pendingStudio = "";
	pendingProducer = "";
}

function togglePendingGenre(genre: string) {
	pendingGenreMap = {
		...pendingGenreMap,
		[genre]: !pendingGenreMap[genre],
	};
}

function applyFilters() {
	const params = new URLSearchParams();
	if (data.search) params.set("search", data.search);
	const selectedGenres = Object.keys(pendingGenreMap).filter((k) => pendingGenreMap[k]);
	if (selectedGenres.length) params.set("genre", selectedGenres.join(","));
	if (pendingYear) params.set("broadcastYear", pendingYear);
	if (pendingSeason) params.set("broadcastSeason", pendingSeason);
	if (pendingStudio) params.set("studio", pendingStudio);
	if (pendingProducer) params.set("producer", pendingProducer);
	if (data.tab && data.tab !== "popular") params.set("tab", data.tab);
	const qs = params.toString();
	goto(qs ? `/anime?${qs}` : "/anime");
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
	const s = pendingSeason;
	const st = pendingStudio;
	const pr = pendingProducer;
	if (!filterSheetOpen) return;

	sheetCountLoading = true;
	const controller = new AbortController();

	const timer = setTimeout(async () => {
		const params = new URLSearchParams();
		const gList = Object.keys(gMap).filter((k) => gMap[k]);
		if (gList.length) params.set("genre", gList.join(","));
		if (y) params.set("broadcastYear", y);
		if (s) params.set("broadcastSeason", s);
		if (st) params.set("studio", st);
		if (pr) params.set("producer", pr);
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

function isAiringToday(anime: Anime): boolean {
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
		<h1 class="section-title">アニメ</h1>

		<form method="GET" action="/anime" class="search-form">
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
				{#if data.search || data.genre || data.season || data.broadcastYear || data.broadcastSeason || data.studio || data.producer}
					<a href="/anime" class="search-clear" title="フィルターをすべてクリア">✕</a>
				{/if}
			</div>

			<div class="filter-row filter-row--desktop">
				<div class="filter-group">
					<label for="filter-genre" class="filter-label">ジャンル</label>
					<select id="filter-genre" name="genre" class="filter-select">
						<option value="">すべて</option>
						{#each GENRES as g}
							<option value={g} selected={data.genre === g}>{g}</option>
						{/each}
					</select>
				</div>
				<div class="filter-group filter-group--year">
					<label for="filter-broadcast-year" class="filter-label">放送年</label>
					<input
						id="filter-broadcast-year"
						name="broadcastYear"
						type="number"
						min="1900"
						max="2100"
						class="filter-input"
						placeholder="例: 2025"
						value={data.broadcastYear ?? ''}
					>
				</div>
				<div class="filter-group">
					<label for="filter-broadcast-season" class="filter-label">放送シーズン</label>
					<select id="filter-broadcast-season" name="broadcastSeason" class="filter-select">
						<option value="">すべて</option>
						<option value="冬" selected={data.broadcastSeason === '冬'}>冬</option>
						<option value="春" selected={data.broadcastSeason === '春'}>春</option>
						<option value="夏" selected={data.broadcastSeason === '夏'}>夏</option>
						<option value="秋" selected={data.broadcastSeason === '秋'}>秋</option>
					</select>
				</div>
				<div class="filter-group">
					<label for="filter-studio" class="filter-label">スタジオ</label>
					<input
						id="filter-studio"
						name="studio"
						type="text"
						class="filter-input"
						placeholder="スタジオ名"
						value={data.studio ?? ''}
					>
				</div>
				<div class="filter-group">
					<label for="filter-producer" class="filter-label">制作</label>
					<input
						id="filter-producer"
						name="producer"
						type="text"
						class="filter-input"
						placeholder="制作会社名"
						value={data.producer ?? ''}
					>
				</div>
			</div>
		</form>

		<nav class="tab-nav">
			{#each tabs as tab}
				{#if tab.id !== 'mylist' || data.user}
					<a href="/anime?tab={tab.id}" class="tab-btn" class:active={data.tab === tab.id}>{tab.label}</a>
				{/if}
			{/each}
			{#if data.user}
				<a href="/anime?tab=register" class="tab-btn tab-btn--add" class:active={data.tab === 'register'}
					>＋登録</a
				>
			{/if}
		</nav>

		{#if data.search}
			<p class="search-label">「{data.search}」の検索結果 — {data.animes.length}件</p>
		{:else if data.genre}
			<p class="search-label">
				ジャンル：<strong>{data.genre}</strong>
				— {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.season}
			<p class="search-label">
				シーズン：<strong>{data.season}</strong>
				— {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.broadcastYear || data.broadcastSeason}
			<p class="search-label">
				放送時期：<strong>{[data.broadcastYear, data.broadcastSeason].filter(Boolean).join(' ')}</strong>
				／ {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.studio}
			<p class="search-label">
				スタジオ：<strong>{data.studio}</strong>
				— {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{:else if data.producer}
			<p class="search-label">
				制作：<strong>{data.producer}</strong>
				— {data.animes.length}件 <a href="/anime" class="filter-clear">✕</a>
			</p>
		{/if}

		{#if data.tab === 'register'}
			<AnimeRegisterForm {form} />
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
					{#each currentAnimeSection.items as anime, sectionItemIndex}
						{@const rankIndex = currentAnimeSection.start + sectionItemIndex}
						<a href="/anime/{anime.id}" class="anime-card">
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
								{#if anime.title_en}
									<p class="anime-title-en">{anime.title_en}</p>
								{/if}
								<div class="anime-meta">
									<span class="anime-status-badge status-{anime.computed_broadcast_status}"
										>{animeStatusBadge(anime)}</span
									>
									{#if anime.season}
										<span class="anime-season">{anime.season}</span>
									{/if}
								</div>
								{#if anime.user_entry}
									<span class="mylist-badge"
										>{statusLabels[anime.user_entry.status as AnimeStatus]}</span
									>
								{/if}
							</div>
						</a>
					{/each}
				</div>

				{#if animeSections.length > 1}
					<nav class="anime-section-bar" aria-label="50件ごとの表示切り替え">
						<button
							type="button"
							class="anime-section-control"
							onclick={() => setAnimeSectionIndex(0)}
							disabled={currentAnimeSectionIndex === 0}
							aria-label="最初の50件"
						>
							<span aria-hidden="true">«</span>
						</button>
						<button
							type="button"
							class="anime-section-control"
							onclick={() => setAnimeSectionIndex(currentAnimeSectionIndex - 1)}
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
								onclick={() => setAnimeSectionIndex(page.index)}
								aria-label={`${page.section.start + 1}-${page.section.end}件を表示`}
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
								onclick={() => setAnimeSectionIndex(page.index)}
								aria-label={`${page.section.start + 1}-${page.section.end}件を表示`}
								aria-current={currentAnimeSectionIndex === page.index ? 'page' : undefined}
							>
								{page.index + 1}
							</button>
						{/each}
						<button
							type="button"
							class="anime-section-control"
							onclick={() => setAnimeSectionIndex(currentAnimeSectionIndex + 1)}
							disabled={currentAnimeSectionIndex === animeSections.length - 1}
							aria-label="次の50件"
						>
							<span aria-hidden="true">›</span>
						</button>
						<button
							type="button"
							class="anime-section-control"
							onclick={() => setAnimeSectionIndex(animeSections.length - 1)}
							disabled={currentAnimeSectionIndex === animeSections.length - 1}
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
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="quick-add-overlay" role="presentation" onclick={closeQuickAdd}>
			<div
				class="quick-add-modal"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="quick-add-title"
				tabindex="-1"
			>
				<div class="quick-add-header">
					<div class="quick-add-cover">
						{#if quickAddAnime.cover_url}
							<img src={quickAddAnime.cover_url ?? ''} alt={quickAddAnime.title}>
						{/if}
					</div>
					<div class="quick-add-header-text">
						<h3 class="quick-add-title" id="quick-add-title">{quickAddAnime.title}</h3>
						<p class="quick-add-subtitle">ステータスを選択</p>
					</div>
				</div>
				<form
					method="POST"
					action="?/upsertWatchlist"
					use:enhance={() => {
                        quickAddSubmitting = true;
                        return async ({ update }) => {
                            await update();
                            quickAddSubmitting = false;
                            quickAddAnime = null;
                        };
                    }}
				>
					<input type="hidden" name="anime_id" value={quickAddAnime.id}>
					<div class="status-options">
						{#each statusOptions as opt}
							<button
								type="submit"
								name="status"
								value={opt.value}
								class="status-option-btn"
								class:current={quickAddAnime.user_entry?.status === opt.value}
								disabled={quickAddSubmitting}
							>
								<span class="status-dot" style="background: {opt.color}"></span>
								<span>{opt.label}</span>
								{#if quickAddAnime.user_entry?.status === opt.value}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="currentColor"
										aria-hidden="true"
										class="check-icon"
									>
										<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</form>
				<button type="button" class="quick-add-cancel" onclick={closeQuickAdd}>キャンセル</button>
			</div>
		</div>
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
						<input
							type="number"
							min="1900"
							max="2100"
							class="filter-sheet-input"
							placeholder="例: 2025"
							bind:value={pendingYear}
						>
					</section>

					<section class="filter-sheet-section">
						<h3 class="filter-sheet-section-label">放送シーズン</h3>
						<div class="season-chips">
							{#each ["冬", "春", "夏", "秋"] as s}
								<button
									type="button"
									class="season-chip"
									class:season-chip--active={pendingSeason === s}
									onclick={() => { pendingSeason = pendingSeason === s ? "" : s; }}
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
						<h3 class="filter-sheet-section-label">制作会社</h3>
						<input
							type="text"
							class="filter-sheet-input"
							placeholder="制作会社名"
							bind:value={pendingProducer}
						>
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
	max-width: 1100px;
	margin: 0 auto;
	padding: 0 16px;
	box-sizing: border-box;
}
.anime-main {
	width: 100%;
	min-width: 0;
}

.search-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-bottom: 16px;
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
	color: var(--text-muted);
	pointer-events: none;
}
.search-input {
	width: 100%;
	padding: 9px 12px 9px 34px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--card-bg);
	color: var(--text);
	font-size: 0.9rem;
	outline: none;
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
	box-sizing: border-box;
}
.search-input:focus {
	border-color: var(--accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}
.search-btn {
	padding: 9px 18px;
	border-radius: 8px;
	background: var(--accent);
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
	border: 1px solid var(--border);
	color: var(--text-muted);
	text-decoration: none;
	font-size: 0.85rem;
	transition:
		background 0.15s,
		color 0.15s;
	line-height: 1;
}
.search-clear:hover {
	background: var(--hover-bg);
	color: var(--text);
}

.filter-row {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	align-items: flex-end;
	padding: 10px 12px;
	background: var(--card-bg);
	border: 1px solid var(--border);
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
	flex: 0 1 120px;
}
.filter-label {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--text-muted);
	letter-spacing: 0.02em;
}
.filter-select,
.filter-input {
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid var(--border);
	background: var(--bg, #fff);
	color: var(--text);
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
	border-color: var(--accent);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent);
}

.filter-clear {
	margin-left: 6px;
	padding: 2px 7px;
	border-radius: 6px;
	border: 1px solid var(--border);
	color: var(--text-muted);
	text-decoration: none;
	font-size: 0.8rem;
}
.filter-clear:hover {
	background: var(--hover-bg);
}
.search-label {
	font-size: 0.85rem;
	color: var(--text-muted);
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
	background: var(--accent);
	color: #fff;
	border-color: var(--accent);
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
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 14px;
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

@media (max-width: 768px) and (orientation: landscape) {
	.anime-list-surface {
		padding-bottom: 0;
	}
}
.anime-card {
	display: flex;
	flex-direction: column;
	text-decoration: none;
	color: var(--text);
	border-radius: 8px;
	overflow: hidden;
	border: 1px solid var(--border);
	transition:
		border-color 0.15s,
		transform 0.15s;
}
.anime-card:hover {
	border-color: var(--accent);
	transform: translateY(-2px);
}

.anime-cover {
	position: relative;
	aspect-ratio: 1 / 1.414;
	background: var(--card-bg);
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
	color: var(--text-muted);
	background: var(--hover-bg);
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
	margin: 0;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.anime-title-en {
	font-size: 0.72rem;
	color: var(--text-muted);
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.anime-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	align-items: center;
	margin-top: 2px;
}
.anime-status-badge {
	font-size: 0.7rem;
	padding: 1px 5px;
	border-radius: 3px;
	font-weight: 600;
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
	background: var(--hover-bg);
	color: var(--text-muted);
}
.status-unknown {
	background: var(--hover-bg);
	color: var(--text-muted);
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
	color: var(--text-muted);
}
.mylist-badge {
	font-size: 0.7rem;
	padding: 1px 5px;
	border-radius: 3px;
	background: var(--accent-muted, #19448e22);
	color: var(--accent);
	width: fit-content;
}

.empty-state {
	text-align: center;
	padding: 60px 20px;
	color: var(--text-muted);
}

.anime-grid--empty .empty-state {
	grid-column: 1 / -1;
}

/* ─── 登録タブ ─── */
.tab-btn--add {
	color: var(--accent);
	font-weight: 600;
}
.tab-btn--add.active {
	background: var(--accent);
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
	background: var(--accent);
	border-color: var(--accent);
	transform: scale(1.1);
}
.quick-add-btn.in-list {
	background: rgba(124, 58, 237, 0.75);
	border-color: rgba(124, 58, 237, 0.9);
}
.quick-add-btn.in-list:hover {
	background: var(--accent);
}

/* ─── クイック追加モーダル ─── */
.quick-add-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(2px);
}
.quick-add-modal {
	background: var(--card-bg);
	border: 1px solid var(--border);
	border-radius: 12px;
	width: 320px;
	max-width: calc(100vw - 32px);
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	overflow: hidden;
}
.quick-add-header {
	display: flex;
	gap: 12px;
	align-items: center;
	padding: 14px 16px;
	border-bottom: 1px solid var(--border);
}
.quick-add-cover {
	width: 44px;
	height: 66px;
	border-radius: 4px;
	overflow: hidden;
	flex-shrink: 0;
	background: var(--hover-bg);
}
.quick-add-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: top center;
	image-rendering: smooth;
}
.quick-add-header-text {
	flex: 1;
	min-width: 0;
}
.quick-add-title {
	font-size: 0.9rem;
	font-weight: 600;
	margin: 0 0 4px;
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.quick-add-subtitle {
	font-size: 0.75rem;
	color: var(--text-muted);
	margin: 0;
}
.status-options {
	display: flex;
	flex-direction: column;
	padding: 8px;
	gap: 4px;
}
.status-option-btn {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 12px;
	border-radius: 8px;
	border: 1px solid transparent;
	background: transparent;
	color: var(--text);
	font-size: 0.875rem;
	cursor: pointer;
	text-align: left;
	transition:
		background 0.12s,
		border-color 0.12s;
}
.status-option-btn:hover:not(:disabled) {
	background: var(--hover-bg);
	border-color: var(--border);
}
.status-option-btn.current {
	background: color-mix(in srgb, var(--accent) 10%, transparent);
	border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.status-option-btn:disabled {
	opacity: 0.5;
	cursor: wait;
}
.status-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}
.check-icon {
	margin-left: auto;
	color: var(--accent);
}
.quick-add-cancel {
	display: block;
	width: calc(100% - 16px);
	margin: 0 8px 8px;
	padding: 9px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: transparent;
	color: var(--text-muted);
	font-size: 0.85rem;
	cursor: pointer;
	transition:
		background 0.12s,
		color 0.12s;
}
.quick-add-cancel:hover {
	background: var(--hover-bg);
	color: var(--text);
}

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
.filter-sheet-input:focus {
	border-color: var(--accent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}
.filter-sheet-clear {
	align-self: flex-start;
	padding: 6px 14px;
	border-radius: 8px;
	border: 1px solid var(--border);
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
	.filter-icon-btn {
		display: flex;
	}
	.filter-row--desktop {
		display: none;
	}
}
</style>
