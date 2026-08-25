import { error, fail } from "@sveltejs/kit";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { addBroadcastOverrideAction, deleteBroadcastOverrideAction, updateAnimeAction } from "$lib/server/anime-admin";
import {
	getAnime,
	getAnimeDataAttributions,
	getAnimeRelations,
	getBroadcastRoomOverridesForAnime,
	getBroadcastRoomScheduleSnapshotsForAnime,
	getEventsForAnime,
	getUsersWhoListedAnime,
	isAdminUser,
} from "$lib/server/queries";
import { normalizedBroadcastEpisodeLabel } from "$lib/utils/broadcast-episodes";
import { isEligibleForRoomLog, roomDateKey } from "$lib/utils/broadcast-room";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const [anime, listedUsers, isAdmin] = await Promise.all([
		getAnime(supabase, params.id, user?.id ?? null),
		getUsersWhoListedAnime(supabase, params.id),
		user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
	]);

	if (!anime) throw error(404, "アニメが見つかりません");

	const [relations, dataAttributions, broadcastOverrides, events, scheduleSnapshots] = await Promise.all([
		getAnimeRelations(supabase, anime.mal_id),
		getAnimeDataAttributions(supabase, anime.mal_id),
		getBroadcastRoomOverridesForAnime(supabase, params.id),
		getEventsForAnime(supabase, Number(anime.id)),
		getBroadcastRoomScheduleSnapshotsForAnime(supabase, Number(anime.id)),
	]);

	// 各話ルームの履歴は実際に開催されたセッション（しょぼい由来の話数付き
	// スナップショット）が唯一の情報源。曜日からの機械カウントは行わない。
	// 管理者オーバーライドはラベル（総集編等）の上書きにだけ使う。
	const overrideByDate = new Map(broadcastOverrides.map((override) => [roomDateKey(override.room_date), override]));
	const episodes = isEligibleForRoomLog(anime.season)
		? scheduleSnapshots
				.map((snapshot) => {
					const override = overrideByDate.get(snapshot.date);
					return {
						date: snapshot.date,
						start: snapshot.start,
						end: snapshot.end,
						label: (override ? normalizedBroadcastEpisodeLabel(override) : null) ?? snapshot.label,
					};
				})
				.sort((left, right) => right.date.localeCompare(left.date))
		: [];

	return { anime, user, isAdmin, listedUsers, relations, dataAttributions, episodes, broadcastOverrides, events };
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
