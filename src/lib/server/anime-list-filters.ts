import type { AnimeListOptions } from "$lib/server/queries";

export type AnimeListTab = "popular" | "trending" | "top_rated" | "mylist" | "airing" | "upcoming" | "register";
export type AnimeSeasonChip = "" | "冬" | "春" | "夏" | "秋";

export interface AnimeListFilters {
	tab: AnimeListTab;
	search: string;
	genres: string[];
	genre: string;
	season: string;
	broadcastYear: string;
	broadcastSeason: AnimeSeasonChip;
	studio: string;
	producer: string;
	source: string;
	hasSearchFilters: boolean;
}

type AnimeCountOptions = Pick<
	AnimeListOptions,
	"genre" | "genres" | "broadcastYear" | "broadcastSeason" | "studio" | "producer" | "source" | "query"
>;

function parseGenres(value: string | null): string[] {
	return [
		...new Set(
			(value ?? "")
				.split(",")
				.map((genre) => genre.trim())
				.filter(Boolean),
		),
	];
}

function normalizeSeasonChip(value: string | null): AnimeSeasonChip {
	const season = value?.trim();
	return season === "冬" || season === "春" || season === "夏" || season === "秋" ? season : "";
}

function normalizeTab(value: string | null): AnimeListTab {
	if (
		value === "trending" ||
		value === "top_rated" ||
		value === "mylist" ||
		value === "airing" ||
		value === "upcoming" ||
		value === "register"
	) {
		return value;
	}
	return "popular";
}

function sortByForTab(tab: AnimeListTab): NonNullable<AnimeListOptions["sortBy"]> {
	if (tab === "trending") return "trending";
	if (tab === "top_rated") return "top_rated";
	if (tab === "mylist") return "created";
	return "popular";
}

export function parseAnimeListFilters(searchParams: URLSearchParams): AnimeListFilters {
	const tab = normalizeTab(searchParams.get("tab"));
	const search = searchParams.get("search")?.trim() ?? "";
	const genres = parseGenres(searchParams.get("genres") ?? searchParams.get("genre"));
	const seasonParam = searchParams.get("season")?.trim() ?? "";
	const broadcastYearParam = (searchParams.get("year") ?? searchParams.get("broadcastYear"))?.trim() ?? "";
	const broadcastYear = /^\d{4}$/.test(broadcastYearParam) ? broadcastYearParam : "";
	const broadcastSeason = normalizeSeasonChip(searchParams.get("season") ?? searchParams.get("broadcastSeason"));
	const season = broadcastSeason ? "" : seasonParam;
	const studio = searchParams.get("studio")?.trim() ?? "";
	const producer = searchParams.get("producer")?.trim() ?? "";
	const source = searchParams.get("source")?.trim() ?? "";
	const hasSearchFilters = Boolean(
		search || genres.length || season || broadcastYear || broadcastSeason || studio || producer || source,
	);

	return {
		tab,
		search,
		genres,
		genre: genres.join(","),
		season,
		broadcastYear,
		broadcastSeason,
		studio,
		producer,
		source,
		hasSearchFilters,
	};
}

export function buildAnimeListOptions(
	filters: AnimeListFilters,
	userId: string | null,
	limit = 1000,
): AnimeListOptions {
	const options: AnimeListOptions = {
		limit,
		userId,
		sortBy: sortByForTab(filters.tab),
	};

	if (filters.tab === "airing") options.broadcastStatus = "airing";
	if (filters.tab === "upcoming") options.broadcastStatus = "upcoming";
	if (filters.tab === "mylist") options.listedByUserId = userId;
	if (filters.search) options.query = filters.search;
	if (filters.genres.length) options.genres = filters.genres;
	if (filters.season) options.season = filters.season;
	if (filters.broadcastYear) options.broadcastYear = filters.broadcastYear;
	if (filters.broadcastSeason) options.broadcastSeason = filters.broadcastSeason;
	if (filters.studio) options.studio = filters.studio;
	if (filters.producer) options.producer = filters.producer;
	if (filters.source) options.source = filters.source;
	return options;
}

export function buildAnimeCountOptions(filters: AnimeListFilters): AnimeCountOptions {
	const options: AnimeCountOptions = {};
	if (filters.genres.length) options.genres = filters.genres;
	if (filters.broadcastYear) options.broadcastYear = filters.broadcastYear;
	if (filters.broadcastSeason) options.broadcastSeason = filters.broadcastSeason;
	if (filters.studio) options.studio = filters.studio;
	if (filters.producer) options.producer = filters.producer;
	if (filters.source) options.source = filters.source;
	if (filters.search) options.query = filters.search;
	return options;
}
