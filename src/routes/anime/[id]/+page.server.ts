import { error, fail } from "@sveltejs/kit";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { addBroadcastOverrideAction, deleteBroadcastOverrideAction, updateAnimeAction } from "$lib/server/anime-admin";
import {
	getAnime,
	getAnimeRelations,
	getBroadcastRoomOverridesForAnime,
	getUsersWhoListedAnime,
	isAdminUser,
} from "$lib/server/queries";
import { generateBroadcastEpisodeSlots } from "$lib/utils/broadcast-episodes";
import type { Actions, PageServerLoad } from "./$types";

function isEligibleForRoomLog(season: string | null): boolean {
	if (!season) return false;
	const parts = season.split("-");
	const y = parseInt(parts[0] ?? "", 10);
	const name = parts[1];
	if (y > 2026) return true;
	return y === 2026 && name !== "winter";
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);

	if (!anime) throw error(404, "アニメが見つかりません");

	const [listedUsers, relations, broadcastOverrides, isAdmin] = await Promise.all([
		getUsersWhoListedAnime(supabase, params.id),
		getAnimeRelations(supabase, anime.mal_id),
		getBroadcastRoomOverridesForAnime(supabase, params.id),
		user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
	]);

	const episodes =
		isEligibleForRoomLog(anime.season) &&
		anime.aired_from != null &&
		(anime.broadcast_day != null || broadcastOverrides.length > 0)
			? generateBroadcastEpisodeSlots({
					airedFrom: anime.aired_from,
					airedTo: anime.aired_to ?? null,
					broadcastDay: anime.broadcast_day,
					broadcastTime: anime.broadcast_time,
					episodeCount: anime.episode_count,
					overrides: broadcastOverrides,
				}).reverse()
			: [];

	return { anime, user, isAdmin, listedUsers, relations, episodes, broadcastOverrides };
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

	updateAnime: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const anime = await getAnime(supabase, params.id, user.id);
		if (!anime) return fail(404, { message: "アニメが見つかりません" });

		return updateAnimeAction(supabase, request, params.id, anime.cover_url);
	},

	addBroadcastOverride: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		return addBroadcastOverrideAction(supabase, request, params.id);
	},

	deleteBroadcastOverride: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		return deleteBroadcastOverrideAction(supabase, request);
	},
};
