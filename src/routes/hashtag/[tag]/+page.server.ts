import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import { enrichPostsWithCounts, getAnimeRankingTrending } from "$lib/server/queries";
import type { RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = buildPostCardSelect();

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const tag = params.tag.toLowerCase();

	const { data: hashtag } = await supabase.from("hashtags").select("id").eq("name", tag).maybeSingle();

	const [postsResult, trendingResult, animeTrending] = await Promise.all([
		(async () => {
			if (!hashtag) return { data: [] };

			const { data: links } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", hashtag.id);

			const postIds = (links ?? []).map((l) => l.post_id);
			if (postIds.length === 0) return { data: [] };

			return supabase
				.from("posts")
				.select(POSTS_SELECT)
				.in("id", postIds)
				.order("created_at", { ascending: false })
				.limit(50);
		})(),

		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	const posts = await enrichPostsWithCounts(
		supabase,
		(postsResult.data ?? []) as unknown as RawPost[],
		user?.id ?? null,
	);

	return { tag, posts, trending: trendingResult.data ?? [], animeTrending };
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
