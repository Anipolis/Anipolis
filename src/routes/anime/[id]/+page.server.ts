import { error, fail } from "@sveltejs/kit";
import { buildEpisodeRoomList, hasEpisodeRooms, openableEpisodeLimit } from "$lib/episode-room";
import { recommendAnimeAction, removeUserAnimeEntry, upsertUserAnimeEntry } from "$lib/server/actions";
import { addBroadcastOverrideAction, deleteBroadcastOverrideAction, updateAnimeAction } from "$lib/server/anime-admin";
import { buildBroadcastEpisodeLog } from "$lib/server/broadcast-episode-log";
import {
	getAnime,
	getAnimeRelations,
	getAnimeSyobocalUrl,
	getBroadcastRoomOverridesForAnime,
	getBroadcastRoomScheduleSnapshotsForAnime,
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

	const [relations, syobocalUrl, broadcastOverrides, events, scheduleSnapshots, roomInfo] = await Promise.all([
		getAnimeRelations(supabase, anime.mal_id),
		getAnimeSyobocalUrl(supabase, anime.mal_id),
		getBroadcastRoomOverridesForAnime(supabase, params.id),
		getEventsForAnime(supabase, Number(anime.id)),
		getBroadcastRoomScheduleSnapshotsForAnime(supabase, Number(anime.id)),
		// episode_total（152）は作品のビューに含まれないので anime から直接読む
		supabase
			.from("anime")
			.select("type, room_type, episode_total, status, aired_from")
			.eq("id", Number(anime.id))
			.maybeSingle(),
	]);

	// 話数ルーム（153）の一覧。話数のある作品だけ（映画・特番・1話だけの配信作品は無し）。
	// 取得に失敗したら空にして、今の日付のルームログを出す（失敗を「全話未放送」と見せないため）
	const roomAnime = roomInfo.data;
	const roomLog =
		roomAnime && hasEpisodeRooms(roomAnime) ? await getEpisodeRoomLog(supabase, Number(anime.id)) : null;
	const episodeRooms =
		roomAnime && roomLog
			? buildEpisodeRoomList({
					animeId: anime.id,
					...roomLog,
					episodeTotal: roomAnime.episode_total,
					openableUpTo: openableEpisodeLimit({ anime: roomAnime, ...roomLog, now: Date.now() }),
				})
			: [];
	// 話数ルームに入っていない実在の放送枠（話数が付いていない）の放送日。日付のルームログとして別に出す
	const unroomedDates = new Set(roomLog?.unroomedDates ?? []);

	// 各話ルームの履歴タイムライン（実在セッション+同期前の合成補完+アンカー逆算）
	// の構築は buildBroadcastEpisodeLog に集約。未開場セッションは逆算のアンカー
	// としてだけ使い、ログには開場済み（opened）の日付のみ載せる。
	const episodes = buildBroadcastEpisodeLog(anime, scheduleSnapshots, broadcastOverrides)
		.filter((slot) => slot.opened)
		.sort((left, right) => right.date.localeCompare(left.date));
	// 推定で話数が付いていても、実際の放送枠がルームに入っていなければ残す（日付のルームと投稿を見失わないように）。
	// 放送枠の無い（推定だけの）日付は投稿が無いので出さない
	const episodesWithoutRoom = episodeRooms.length > 0 ? episodes.filter((slot) => unroomedDates.has(slot.date)) : [];

	return {
		anime,
		user,
		isAdmin,
		listedUsers,
		relations,
		syobocalUrl,
		episodes,
		episodeRooms,
		episodesWithoutRoom,
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
};
