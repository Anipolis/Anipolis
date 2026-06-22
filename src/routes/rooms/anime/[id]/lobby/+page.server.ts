import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import {
	getAnime,
	getAnimeRankingTrending,
	getBroadcastRoomPosts,
	getGlobalAnimeLobbySession,
} from "$lib/server/queries";
import type { Anime } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

function fallbackRoomHashtag(title: string) {
	return title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

function normalizeHashtag(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

function roomHashtag(anime: Anime) {
	const officialHashtag = anime.official_hashtag?.map(normalizeHashtag).find((tag) => tag.length > 0);
	return officialHashtag ?? fallbackRoomHashtag(anime.title);
}

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const anime = await getAnime(supabase, params.id, user?.id ?? null);
	if (!anime || anime.room_type !== "global") throw error(404, "総合ロビーが見つかりません");

	const session = await getGlobalAnimeLobbySession(supabase, anime.id);
	if (!session) throw error(404, "総合ロビーが見つかりません");

	const hashtag = roomHashtag(anime);
	const [posts, trending, animeTrending] = await Promise.all([
		getBroadcastRoomPosts(supabase, session.id, user?.id ?? null, { limit: 100, ascending: true }),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	return {
		anime,
		room: {
			session_id: session.id,
			date: "lobby",
			kind: "global",
			hashtag,
			scheduled_at: session.scheduled_at,
			posting_opens_at: session.posting_opens_at,
			posting_closes_at: session.posting_closes_at,
			duration_minutes: session.duration_minutes,
			title: `${anime.title} 総合ロビー`,
		},
		posts,
		trending: trending.data ?? [],
		animeTrending,
		user,
	};
};

export const actions: Actions = {
	createPost: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const anime = await getAnime(supabase, params.id, user.id);
		if (!anime || anime.room_type !== "global") return fail(404, { message: "総合ロビーが見つかりません" });

		const session = await getGlobalAnimeLobbySession(supabase, anime.id);
		if (!session) return fail(404, { message: "総合ロビーが見つかりません" });

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		const hashtag = roomHashtag(anime);
		const hasTag = content.toLowerCase().includes(`#${hashtag.toLowerCase()}`);
		const finalContent = hasTag ? content : `${content} #${hashtag}`;

		return insertPostWithHashtags(supabase, user.id, finalContent, null, [], anime.id, null, null, session.id);
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

	bookmark: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleBookmarkAction(request, supabase, user.id);
	},

	repost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleRepostAction(request, supabase, user.id);
	},
};
