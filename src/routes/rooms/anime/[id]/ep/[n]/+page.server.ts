import { error, fail, redirect } from "@sveltejs/kit";
import { cumulativeSeasonRangeOf, episodeRoomPath, hasEpisodeRooms, parseEpisodeNumberParam } from "$lib/episode-room";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { buildEpisodeRoomPageData, createEpisodeRoomPost } from "$lib/server/episode-room-page";
import {
	ensureEpisodeRoom,
	getAnime,
	getEpisodeRoomById,
	getEpisodeRoomByNumber,
	getEpisodeRoomLog,
} from "$lib/server/queries";
import type { Anime, EpisodeRoom } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 話数ルーム（実況ルームの話数単位化・153）。作品×話数のルームで、投稿の期限は無い。
 * 放送枠（初回・再放送・イベント）はルームの中の区切りとして見出しに使う。
 */

/**
 * 通算の話数の作品で、この話数がシーズンの範囲に入るか（通算でなければ null）。
 * 取得に失敗したら判断せず null にして、これまでどおり DB に任せる
 */
async function isInCumulativeSeason(
	supabase: App.Locals["supabase"],
	anime: Pick<Anime, "id" | "episode_total" | "aired_from" | "aired_to">,
	episodeNumber: number,
): Promise<boolean | null> {
	const log = await getEpisodeRoomLog(supabase, Number(anime.id));
	const season = log ? cumulativeSeasonRangeOf(anime, log.rooms, log.airings, Date.now()) : null;
	return season ? episodeNumber >= season.first && episodeNumber <= season.last : null;
}

/** 話数ルームを探し、無ければ開いてよいか DB に判断させて作る。統合済みなら統合先を返す */
async function resolveEpisodeRoom(
	supabase: App.Locals["supabase"],
	anime: Pick<Anime, "id" | "episode_total" | "aired_from" | "aired_to">,
	episodeNumber: number,
): Promise<{ room: EpisodeRoom | null; inCumulativeSeason: boolean | null }> {
	const animeId = Number(anime.id);
	let room = await getEpisodeRoomByNumber(supabase, animeId, episodeNumber);
	let inCumulativeSeason: boolean | null = null;
	if (!room) {
		// シーズンの範囲の外の話は、ルームを作らない（全12話で第25〜36話の作品の第5話など）
		inCumulativeSeason = await isInCumulativeSeason(supabase, anime, episodeNumber);
		if (inCumulativeSeason !== false) room = await ensureEpisodeRoom(supabase, animeId, episodeNumber);
	}
	if (room?.merged_into) room = (await getEpisodeRoomById(supabase, room.merged_into)) ?? room;
	return { room, inCumulativeSeason };
}

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const episodeNumber = parseEpisodeNumberParam(params.n);
	if (episodeNumber == null) throw error(404, "ルームが見つかりません");

	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime) throw error(404, "アニメが見つかりません");
	const animeId = Number(anime.id);

	const { room, inCumulativeSeason } = await resolveEpisodeRoom(supabase, anime, episodeNumber);
	if (room && room.kind === "episode" && room.episode_number != null && room.episode_number !== episodeNumber) {
		// 統合先の話数へ（元の URL のクエリは引き継がない）
		redirect(302, episodeRoomPath(animeId, room.episode_number));
	}
	if (!room) {
		// ルームがまだ無い話: 話数のある作品の範囲内なら「まだ投稿できない」ページとして見せる
		const inRange =
			hasEpisodeRooms(anime) &&
			(inCumulativeSeason ?? (anime.episode_total == null || episodeNumber <= anime.episode_total));
		if (!inRange) throw error(404, "ルームが見つかりません");
	}

	return buildEpisodeRoomPageData({
		supabase,
		user,
		url,
		anime,
		room,
		title: `${anime.title} 第${episodeNumber}話`,
		episodeNumber,
	});
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const episodeNumber = parseEpisodeNumberParam(params.n);
		const anime = episodeNumber == null ? null : await getAnime(supabase, params.id, user.id);
		if (!anime || episodeNumber == null) return fail(404, { message: "ルームが見つかりません" });

		const { room } = await resolveEpisodeRoom(supabase, anime, episodeNumber);
		return createEpisodeRoomPost({ supabase, userId: user.id, request, anime, room });
	},

	deletePost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return deletePostAction(request, supabase, user.id);
	},

	like: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleLikeAction(request, supabase, user.id);
	},

	repost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleRepostAction(request, supabase, user.id);
	},

	bookmark: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleBookmarkAction(request, supabase, user.id);
	},
};
