import { fail, redirect } from "@sveltejs/kit";
import { cancelAnimeExchangeAction, exchangeAnimeAction } from "$lib/server/actions";
import { getAnimeExchangeEntries, getAnimeRankingTrending, getTrendingHashtags } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(302, "/");

	const [exchanges, waitingExchanges, trendingResult, animeTrending] = await Promise.all([
		getAnimeExchangeEntries(supabase, user.id),
		getAnimeExchangeEntries(supabase, user.id, 1, "waiting"),
		getTrendingHashtags(supabase, 10),
		getAnimeRankingTrending(supabase, 5),
	]);
	const waitingExchange = exchanges.find((entry) => entry.status === "waiting") ?? waitingExchanges[0] ?? null;

	return {
		user,
		exchanges,
		waitingExchange,
		latestMatchedExchange: exchanges.find((entry) => entry.status === "matched" && entry.received_anime) ?? null,
		trending: trendingResult,
		animeTrending,
	};
};

export const actions: Actions = {
	exchangeAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { exchangeMessage: "ログインが必要です" });
		return exchangeAnimeAction(supabase, request, user.id);
	},

	cancelExchange: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { cancelMessage: "ログインが必要です" });
		return cancelAnimeExchangeAction(supabase, user.id);
	},
};
