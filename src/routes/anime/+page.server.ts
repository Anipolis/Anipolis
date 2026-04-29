import { fail } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
	getAnimeList,
	getAnimeRankingPopularity,
	getAnimeRankingTopRated,
	getAnimeRankingTrending,
	getUserAnimeList,
} from "$lib/server/queries";
import type { Anime } from "$lib/types";

type Tab = "popular" | "trending" | "top_rated" | "mylist" | "airing" | "upcoming";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const tab = (url.searchParams.get("tab") as Tab) ?? "popular";
	const search = url.searchParams.get("search")?.trim() ?? "";
	const genre = url.searchParams.get("genre")?.trim() ?? "";
	const season = url.searchParams.get("season")?.trim() ?? "";
	const studio = url.searchParams.get("studio")?.trim() ?? "";
	const producer = url.searchParams.get("producer")?.trim() ?? "";

	let animes: Anime[] = [];

	if (search) {
		animes = await getAnimeList(supabase, { query: search, limit: 50, userId: user?.id ?? null });
	} else if (genre) {
		animes = await getAnimeList(supabase, { genre, limit: 100, userId: user?.id ?? null });
	} else if (season) {
		animes = await getAnimeList(supabase, { season, limit: 100, userId: user?.id ?? null });
	} else if (studio) {
		animes = await getAnimeList(supabase, { studio, limit: 100, userId: user?.id ?? null });
	} else if (producer) {
		animes = await getAnimeList(supabase, { producer, limit: 100, userId: user?.id ?? null });
	} else if (tab === "mylist") {
		animes = user ? await getUserAnimeList(supabase, user.id) : [];
	} else if (tab === "trending") {
		animes = await getAnimeRankingTrending(supabase, 50);
	} else if (tab === "top_rated") {
		animes = await getAnimeRankingTopRated(supabase, 50);
	} else if (tab === "airing") {
		animes = await getAnimeList(supabase, { status: "airing", limit: 50, userId: user?.id ?? null });
	} else if (tab === "upcoming") {
		animes = await getAnimeList(supabase, { status: "upcoming", limit: 50, userId: user?.id ?? null });
	} else {
		animes = await getAnimeRankingPopularity(supabase, 50);
	}

	return { animes, tab, search, genre, season, studio, producer, user };
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		const { upsertUserAnimeEntry } = await import("$lib/server/actions");
		return upsertUserAnimeEntry(supabase, request, user.id);
	},
};
