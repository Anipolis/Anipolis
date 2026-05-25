import { error, fail } from "@sveltejs/kit";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { calcBroadcastEpisodes, isEligibleForRoomLog } from "$lib/server/animeUtils";
import { getAnime, getAnimeRelations, getUsersWhoListedAnime, isAdminUser } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const [anime, listedUsers, isAdmin] = await Promise.all([
		getAnime(supabase, params.id, user?.id ?? null),
		getUsersWhoListedAnime(supabase, params.id),
		user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
	]);

	if (!anime) throw error(404, "アニメが見つかりません");

	const relations = await getAnimeRelations(supabase, anime.mal_id);

	const episodes =
		isEligibleForRoomLog(anime.season) && anime.broadcast_day != null && anime.aired_from != null
			? calcBroadcastEpisodes(anime.aired_from, anime.aired_to ?? null, anime.broadcast_day)
			: [];

	return { anime, user, isAdmin, listedUsers, relations, episodes };
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	removeWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return removeUserAnimeEntry(supabase, request, user.id);
	},

	recommendAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { recommendMessage: "ログインが必要です" });
		return recommendAnimeAction(supabase, request, user.id);
	},
};
