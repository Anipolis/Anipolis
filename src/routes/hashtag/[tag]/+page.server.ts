import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "#lib/server/actions.ts";
import { fillTimelinePage, getAnimeRankingTrending, getHashtagPostsPage } from "#lib/server/queries.ts";
import { redirectToLogin } from "#lib/server/require-login.ts";
import { parseTimelineCursor } from "#lib/timeline-cursor.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	// 投稿の一覧は登録した人だけに見せる（共有された投稿の詳細だけは未ログインでも開ける）
	if (!user) redirectToLogin(url);
	const tag = params.tag.toLowerCase();
	const cursor = parseTimelineCursor(url.searchParams);

	// タグの付いた投稿とイベントの投稿は DB の側で合わせ、50件ずつ読む（208、#248）。
	// ミュートで間引かれて少ないときは、ほかの一覧と同じく続きを取り足す
	const [page, trendingResult, animeTrending] = await Promise.all([
		fillTimelinePage((next) => getHashtagPostsPage(supabase, tag, user.id, next), cursor),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);
	if (page.error) console.error("[hashtag] posts query failed:", page.error);

	return {
		tag,
		posts: page.posts,
		postsFailed: page.error != null,
		nextCursor: page.nextCursor,
		isContinuation: cursor != null,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};

export const actions: Actions = {
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
