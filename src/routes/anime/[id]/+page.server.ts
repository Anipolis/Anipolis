import { error, fail } from "@sveltejs/kit";
import { buildEpisodeRoomList, hasEpisodeRooms, openableEpisodeLimit } from "$lib/episode-room";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { addBroadcastOverrideAction, deleteBroadcastOverrideAction, updateAnimeAction } from "$lib/server/anime-admin";
import {
	addEpisodeAiringAction,
	addSpecialRoomAction,
	mergeEpisodeRoomsAction,
	setEpisodeRoomOpensAtAction,
} from "$lib/server/episode-room-admin";
import {
	getAdminEpisodeRooms,
	getAnime,
	getAnimeRelations,
	getAnimeSyobocalUrl,
	getBroadcastRoomOverridesForAnime,
	getEpisodeRoomLog,
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

	const [relations, syobocalUrl, broadcastOverrides, events] = await Promise.all([
		getAnimeRelations(supabase, anime.mal_id),
		getAnimeSyobocalUrl(supabase, anime.mal_id),
		getBroadcastRoomOverridesForAnime(supabase, params.id),
		getEventsForAnime(supabase, Number(anime.id)),
	]);

	// ルームの一覧。話数のある作品だけ話数を並べ、映画や1話だけの配信作品は特番ルームだけ出す（総合ロビーの作品は対象外）
	// 取得に失敗したら、全話未放送と見せずに読み込めなかったと伝える
	const roomLog = anime.room_type === "global" ? null : await getEpisodeRoomLog(supabase, Number(anime.id));
	const roomEntries = roomLog
		? buildEpisodeRoomList({
				animeId: anime.id,
				...roomLog,
				episodeTotal: anime.episode_total,
				openableUpTo: openableEpisodeLimit({ anime, ...roomLog, now: Date.now() }),
			})
		: [];
	const episodeRooms = hasEpisodeRooms(anime) ? roomEntries : roomEntries.filter((entry) => entry.kind === "special");

	// 管理タブ用: 話数ルームの一覧（開く時刻の固定・統合を含む）
	const adminEpisodeRooms = isAdmin ? await getAdminEpisodeRooms(supabase, Number(anime.id)) : [];

	return {
		anime,
		user,
		isAdmin,
		listedUsers,
		relations,
		syobocalUrl,
		episodeRooms,
		episodeRoomsFailed: anime.room_type !== "global" && roomLog === null,
		adminEpisodeRooms,
		broadcastOverrides,
		events,
	};
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

	addSpecialRoom: (event) => runEpisodeRoomAdminAction(event, addSpecialRoomAction),
	setEpisodeRoomOpensAt: (event) => runEpisodeRoomAdminAction(event, setEpisodeRoomOpensAtAction),
	addEpisodeAiring: (event) => runEpisodeRoomAdminAction(event, addEpisodeAiringAction),
	mergeEpisodeRooms: (event) => runEpisodeRoomAdminAction(event, mergeEpisodeRoomsAction),
};

/** 話数ルームの管理操作は管理者だけ。episode_rooms には書き込みのポリシーが無いので service role で書く */
async function runEpisodeRoomAdminAction(
	{ request, params, locals: { supabase, safeGetSession } }: Parameters<Actions[string]>[0],
	action: (
		admin: ReturnType<typeof createServiceRoleClient>,
		animeId: number,
		form: FormData,
	) => ReturnType<typeof addSpecialRoomAction>,
) {
	const { user } = await safeGetSession();
	if (!user) return fail(401, { roomMessage: "ログインが必要です" });
	if (!(await isAdminUser(supabase, user.id))) return fail(403, { roomMessage: "管理者権限が必要です" });
	const anime = await getAnime(supabase, params.id, user.id);
	if (!anime) return fail(404, { roomMessage: "アニメが見つかりません" });
	return action(createServiceRoleClient(), Number(anime.id), await request.formData());
}
