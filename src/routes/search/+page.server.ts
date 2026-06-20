import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import { enrichPostsWithCounts, getAnimeRankingTrending, quoteOrFilterValue } from "$lib/server/queries";
import type { RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = buildPostCardSelect();

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const query = url.searchParams.get("q")?.trim() ?? "";
	const trendingPromise = supabase.rpc("get_trending_hashtags", { limit_count: 10 });
	const animeTrendingPromise = getAnimeRankingTrending(supabase, 5);

	if (!query) {
		const [trendingResult, animeTrending] = await Promise.all([trendingPromise, animeTrendingPromise]);
		return { query: "", posts: [], users: [], user, trending: trendingResult.data ?? [], animeTrending };
	}

	const pattern = `%${query}%`;

	const [postsResult, usersResult, trendingResult, animeTrending] = await Promise.all([
		supabase
			.from("posts")
			.select(POSTS_SELECT)
			.ilike("content", pattern)
			.order("created_at", { ascending: false })
			.limit(30),

		supabase
			.from("profiles")
			.select("id, username, display_name, avatar_url")
			.or(`username.ilike.${quoteOrFilterValue(pattern)},display_name.ilike.${quoteOrFilterValue(pattern)}`)
			.limit(10),
		trendingPromise,
		animeTrendingPromise,
	]);

	const posts = await enrichPostsWithCounts(
		supabase,
		(postsResult.data ?? []) as unknown as RawPost[],
		user?.id ?? null,
	);

	return {
		query,
		posts,
		users: usersResult.data ?? [],
		user,
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
