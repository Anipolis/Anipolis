import { fail } from "@sveltejs/kit";
import { registerAnimeAction } from "$lib/server/anime-admin";
import { buildAnimeListOptions, parseAnimeListFilters } from "$lib/server/anime-list-filters";
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

/** Anime 全フィールドを HTML に埋め込まず、カード描画に必要な9フィールドだけへ射影する。 */
function toAnimeListItem(a: Anime): AnimeListItem {
	return {
		id: a.id,
		title: a.title,
		title_en: a.title_en,
		cover_url: a.cover_url,
		season: a.season,
		episode_count: a.episode_count,
		broadcast_day: a.broadcast_day,
		computed_broadcast_status: a.computed_broadcast_status,
		user_entry: a.user_entry ?? null,
	};
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const isAdmin = user ? await isAdminUser(supabase, user.id) : false;
	const filters = parseAnimeListFilters(url.searchParams);
	const { tab, search, genre, genres, season, broadcastYear, broadcastSeason, studio, producer, source } = filters;

	let animes: Anime[];

	if (filters.hasSearchFilters) {
		if (tab === "mylist") {
			if (!user) {
				animes = [];
				return {
					animes: [],
					tab,
					search,
					genre,
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
		}
		animes = await getAnimeList(supabase, buildAnimeListOptions(filters, user?.id ?? null));
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
	} else if (tab === "all") {
		animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
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
		genre,
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
