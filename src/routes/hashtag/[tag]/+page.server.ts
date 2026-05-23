import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { enrichPostsWithCounts } from "$lib/server/queries";
import type { Post } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const tag = params.tag.toLowerCase();

	const [{ data: hashtag }, trendingResult] = await Promise.all([
		supabase.from("hashtags").select("id").eq("name", tag).maybeSingle(),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
	]);

	const posts = (async () => {
		if (!hashtag) return [] as Post[];

		const { data: links } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", hashtag.id);

		const postIds = (links ?? []).map((link) => link.post_id);
		if (postIds.length === 0) return [] as Post[];

		const { data } = await supabase
			.from("posts")
			.select(
				`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
                 profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
                 post_hashtags ( hashtags ( name ) ),
                 anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
			)
			.in("id", postIds)
			.order("created_at", { ascending: false })
			.limit(50);

		return enrichPostsWithCounts(supabase, data ?? [], user?.id ?? null);
	})().catch((err) => {
		console.error("[hashtag] posts fetch error:", err);
		return [] as Post[];
	});

	return { tag, posts, trending: trendingResult.data ?? [], user };
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
