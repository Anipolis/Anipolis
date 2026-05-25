import { error, fail } from "@sveltejs/kit";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import type { AnimeListUser } from "$lib/server/queries";
import { getAnime, getUsersWhoListedAnime, isAdminUser } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);

	if (!anime) throw error(404, "アニメが見つかりません");

	const isAdmin = user ? await isAdminUser(supabase, user.id) : false;

	const listedUsersPromise: Promise<AnimeListUser[]> = getUsersWhoListedAnime(supabase, params.id).catch((err) => {
		console.error("[anime/[id]] listedUsers fetch error:", err);
		return [] as AnimeListUser[];
	});

	return { anime, user, isAdmin, listedUsers: listedUsersPromise };
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
