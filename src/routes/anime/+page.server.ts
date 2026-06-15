import { fail } from "@sveltejs/kit";
import { registerAnimeAction } from "$lib/server/anime-admin";
import {
	getAnimeList,
	getAnimeRankingPopularity,
	getAnimeRankingTopRated,
	getAnimeRankingTrending,
	getUserAnimeList,
	isAdminUser,
} from "$lib/server/queries";
import type { Anime, AnimeListItem } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

type Tab = "popular" | "trending" | "top_rated" | "mylist" | "airing" | "upcoming" | "register";
type SeasonChip = "" | "冬" | "春" | "夏" | "秋";

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

function normalizeSeasonChip(value: string | null): SeasonChip {
	const season = value?.trim();
	return season === "冬" || season === "春" || season === "夏" || season === "秋" ? season : "";
}

/** Anime 全フィールドを HTML に埋め込まず、カード描画に必要な8フィールドだけへ射影する。 */
function toAnimeListItem(a: Anime): AnimeListItem {
	return {
		id: a.id,
		title: a.title,
		title_en: a.title_en,
		cover_url: a.cover_url,
		season: a.season,
		broadcast_day: a.broadcast_day,
		computed_broadcast_status: a.computed_broadcast_status,
		user_entry: a.user_entry ?? null,
	};
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const isAdmin = user ? await isAdminUser(supabase, user.id) : false;
	const tab = (url.searchParams.get("tab") as Tab) ?? "popular";
	const search = url.searchParams.get("search")?.trim() ?? "";
	const genres = parseGenres(url.searchParams.get("genres") ?? url.searchParams.get("genre"));
	const seasonParam = url.searchParams.get("season")?.trim() ?? "";
	const broadcastYearParam = (url.searchParams.get("year") ?? url.searchParams.get("broadcastYear"))?.trim() ?? "";
	const broadcastYear = /^\d{4}$/.test(broadcastYearParam) ? broadcastYearParam : "";
	const broadcastSeason = normalizeSeasonChip(
		url.searchParams.get("season") ?? url.searchParams.get("broadcastSeason"),
	);
	const season = broadcastSeason ? "" : seasonParam;
	const studio = url.searchParams.get("studio")?.trim() ?? "";
	const producer = url.searchParams.get("producer")?.trim() ?? "";
	const source = url.searchParams.get("source")?.trim() ?? "";

	let animes: Anime[];
	const hasSearchFilters = Boolean(
		search || genres.length || season || broadcastYear || broadcastSeason || studio || producer || source,
	);

	if (hasSearchFilters) {
		const filters: NonNullable<Parameters<typeof getAnimeList>[1]> = {
			limit: 1000,
			userId: user?.id ?? null,
		};
		if (tab === "trending") filters.sortBy = "trending";
		else if (tab === "top_rated") filters.sortBy = "top_rated";
		else if (tab === "mylist") filters.sortBy = "created";
		else filters.sortBy = "popular";
		if (tab === "airing") filters.broadcastStatus = "airing";
		if (tab === "upcoming") filters.broadcastStatus = "upcoming";
		if (tab === "mylist") {
			if (!user) {
				animes = [];
				return {
					animes: [],
					tab,
					search,
					genre: genres.join(","),
					genres,
					season,
					broadcastYear,
					broadcastSeason,
					studio,
					producer,
					source,
					user,
					isAdmin,
				};
			}
			filters.listedByUserId = user.id;
		}
		if (search) filters.query = search;
		if (genres.length) filters.genres = genres;
		if (season) filters.season = season;
		if (broadcastYear) filters.broadcastYear = broadcastYear;
		if (broadcastSeason) filters.broadcastSeason = broadcastSeason;
		if (studio) filters.studio = studio;
		if (producer) filters.producer = producer;
		if (source) filters.source = source;
		animes = await getAnimeList(supabase, filters);
	} else if (tab === "mylist") {
		animes = user ? await getUserAnimeList(supabase, user.id) : [];
	} else if (tab === "trending") {
		animes = await getAnimeRankingTrending(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	} else if (tab === "top_rated") {
		animes = await getAnimeRankingTopRated(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	} else if (tab === "airing") {
		animes = await getAnimeList(supabase, { broadcastStatus: "airing", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "upcoming") {
		animes = await getAnimeList(supabase, { broadcastStatus: "upcoming", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "register") {
		animes = [];
	} else {
		animes = await getAnimeRankingPopularity(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	}

	return {
		animes: animes.map(toAnimeListItem),
		tab,
		search,
		genre: genres.join(","),
		genres,
		season,
		broadcastYear,
		broadcastSeason,
		studio,
		producer,
		source,
		user,
		isAdmin,
	};
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		const { upsertUserAnimeEntry } = await import("$lib/server/actions");
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	registerAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });
		return registerAnimeAction(supabase, request);
	},
};
