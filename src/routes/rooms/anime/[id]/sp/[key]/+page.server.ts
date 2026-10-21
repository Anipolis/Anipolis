import { error, fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { buildEpisodeRoomPageData, createEpisodeRoomPost } from "$lib/server/episode-room-page";
import { getAnime, getSpecialEpisodeRoom } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 特番ルーム（153）。総集編・0話・先行放送・OVA など、話数とは別に管理者が設置したルーム。
 * 話数ルームと同じく投稿の期限は無い。開く時刻は管理者が設定する。
 */

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime) throw error(404, "アニメが見つかりません");

	const room = await getSpecialEpisodeRoom(supabase, Number(anime.id), params.key);
	if (!room || room.merged_into) throw error(404, "ルームが見つかりません");

	return buildEpisodeRoomPageData({
		supabase,
		user,
		url,
		anime,
		room,
		title: `${anime.title} 特番：${room.label ?? params.key}`,
		episodeNumber: null,
	});
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const anime = await getAnime(supabase, params.id, user.id);
		if (!anime) return fail(404, { message: "ルームが見つかりません" });
		const room = await getSpecialEpisodeRoom(supabase, Number(anime.id), params.key);
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
