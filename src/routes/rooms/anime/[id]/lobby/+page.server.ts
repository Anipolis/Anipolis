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

function stripTrailingRoomHashtag(content: string, hashtag: string) {
	const tag = normalizeHashtag(hashtag);
	if (!tag) return content.trim();
	const trimmed = content.trim();
	const normalized = trimmed.toLowerCase();
	const suffix = `#${tag}`;
	if (!normalized.endsWith(suffix)) return trimmed;
	const before = trimmed.slice(0, trimmed.length - suffix.length);
	if (before.length > 0 && !/\s$/.test(before)) return trimmed;
	return before.trimEnd();
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
			kind: "global" as const,
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
		roomExperiment: {
			enabled: false,
			sessionId: undefined,
		},
		roomExitSurvey: {
			experimentRunId: null,
			alreadyAnswered: false,
			postCount: 0,
			surveyVersion: "room_exit_v1",
		},
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
		const rawContent = (form.get("content") as string | null) ?? "";
		const hashtag = roomHashtag(anime);
		const content = stripTrailingRoomHashtag(rawContent, hashtag);
		if (!content) return fail(400, { message: "投稿内容を入力してください" });

		return insertPostWithHashtags(supabase, user.id, content, null, [], anime.id, null, null, session.id, null, [
			hashtag,
		]);
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
