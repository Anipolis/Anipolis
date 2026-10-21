import { error, fail } from "@sveltejs/kit";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { addBroadcastOverrideAction, deleteBroadcastOverrideAction, updateAnimeAction } from "$lib/server/anime-admin";
import { buildBroadcastEpisodeLog } from "$lib/server/broadcast-episode-log";
import {
	getAnime,
	getAnimeRelations,
	getAnimeSyobocalUrl,
	getBroadcastRoomOverridesForAnime,
	getBroadcastRoomScheduleSnapshotsForAnime,
	getEventsForAnime,
	getUsersWhoListedAnime,
	isAdminUser,
} from "$lib/server/queries";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const [anime, listedUsers, isAdmin] = await Promise.all([
		getAnime(supabase, params.id, user?.id ?? null),
		getUsersWhoListedAnime(supabase, params.id),
		user ? isAdminUser(supabase, user.id) : Promise.resolve(false),
	]);

	if (!anime) throw error(404, "アニメが見つかりません");

	const [relations, syobocalUrl, broadcastOverrides, events, scheduleSnapshots] = await Promise.all([
		getAnimeRelations(supabase, anime.mal_id),
		getAnimeSyobocalUrl(supabase, anime.mal_id),
		getBroadcastRoomOverridesForAnime(supabase, params.id),
		getEventsForAnime(supabase, Number(anime.id)),
		getBroadcastRoomScheduleSnapshotsForAnime(supabase, Number(anime.id)),
	]);

	// 各話ルームの履歴タイムライン（実在セッション+同期前の合成補完+アンカー逆算）
	// の構築は buildBroadcastEpisodeLog に集約。未開場セッションは逆算のアンカー
	// としてだけ使い、ログには開場済み（opened）の日付のみ載せる。
	const episodes = buildBroadcastEpisodeLog(anime, scheduleSnapshots, broadcastOverrides)
		.filter((slot) => slot.opened)
		.sort((left, right) => right.date.localeCompare(left.date));

	return { anime, user, isAdmin, listedUsers, relations, syobocalUrl, episodes, broadcastOverrides, events };
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

		// manual ソースレコードは管理者ユーザーでは書き込めない（RLS）ので service role で保存する。
		// 管理キーが未設定なら従来どおり（保存失敗を警告として返す）
		let sourceWriter: ReturnType<typeof createServiceRoleClient> | undefined;
		try {
			sourceWriter = createServiceRoleClient();
		} catch (serviceError) {
			console.error("service role client unavailable for manual source records:", serviceError);
		}
		return updateAnimeAction(supabase, request, params.id, anime.cover_source_url ?? anime.cover_url, sourceWriter);
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
