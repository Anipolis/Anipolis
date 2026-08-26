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
import { jstBroadcastDate } from "$lib/syobocal-schedule";
import { inferEpisodeNumbersBackward, normalizedBroadcastEpisodeLabel } from "$lib/utils/broadcast-episodes";
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

	// 各話ルームの履歴は実際に存在するセッション（しょぼい由来の話数付き
	// スナップショット）が唯一の情報源。曜日からの機械カウントは行わない。
	// 管理者オーバーライドはラベル（総集編等）の上書きにだけ使う。
	// シーズン境界（isEligibleForRoomLog）はルーム「合成」のゲートであり、
	// 実在セッションの一覧には適用しない: 2026-spring以前開始の長期放送作品
	// （BEYBLADE X等）も、サービス開始後に開催されたルームは列挙する。
	const overrideByDate = new Map(broadcastOverrides.map((override) => [roomDateKey(override.room_date), override]));
	const episodeByDate = new Map<string, import("$lib/utils/broadcast-episodes").BroadcastEpisodeSlot>(
		scheduleSnapshots.map((snapshot) => {
			const override = overrideByDate.get(snapshot.date);
			return [
				snapshot.date,
				{
					date: snapshot.date,
					start: snapshot.start,
					end: snapshot.end,
					label: (override ? normalizedBroadcastEpisodeLabel(override) : null) ?? snapshot.label,
				},
			];
		}),
	);
	// しょぼい同期開始前の放送分にはセッション行が無い。ルームページの合成表示
	// （対象シーズン+曜日・放送期間ゲート）と同じルールで過去日を補完して、
	// 「ログに載る日付 ⇔ ルームページが開ける日付」を一致させる。話数は情報源
	// （しょぼい）が過去に遡れないため付けない — 機械カウントはしない。
	if (
		isEligibleForRoomLog(anime.season) &&
		anime.room_type === "episode" &&
		anime.aired_from != null &&
		anime.broadcast_day != null &&
		anime.broadcast_time != null
	) {
		const todayKey = jstBroadcastDate(new Date());
		const airedToKey = anime.aired_to?.slice(0, 10) ?? null;
		const cursor = new Date(`${anime.aired_from.slice(0, 10)}T00:00:00`);
		while (cursor.getDay() !== anime.broadcast_day) cursor.setDate(cursor.getDate() + 1);
		for (let guard = 0; guard < 400; guard += 1, cursor.setDate(cursor.getDate() + 7)) {
			const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
			if (date >= todayKey || (airedToKey && date > airedToKey)) break;
			if (episodeByDate.has(date)) continue;
			const override = overrideByDate.get(date);
			if (override?.is_cancelled) continue;
			episodeByDate.set(date, {
				date,
				start: null,
				end: null,
				label: override ? normalizedBroadcastEpisodeLabel(override) : null,
			});
		}
	}
	// 同期開始前の合成日付に、しょぼい話数（アンカー）からの逆算で番号を振る。
	// オーバーライド（話数明示・総集編）を尊重し、整合しない作品は番号なしのまま。
	const ascending = [...episodeByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
	inferEpisodeNumbersBackward(ascending, overrideByDate);
	const episodes = ascending.sort((left, right) => right.date.localeCompare(left.date));

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
