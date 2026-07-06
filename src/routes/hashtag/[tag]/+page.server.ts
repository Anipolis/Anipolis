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
			const { data: links } = hashtag
				? await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", hashtag.id)
				: { data: [] };
			const { data: events } = await supabase
				.from("events")
				.select("id")
				.eq("hashtag", tag)
				.eq("is_cancelled", false);

			const postIds = (links ?? []).map((l) => l.post_id);
			const eventIds = (events ?? []).map((event) => event.id);
			if (postIds.length === 0 && eventIds.length === 0) return { data: [] };

			const [taggedPosts, eventPosts] = await Promise.all([
				postIds.length > 0
					? supabase
							.from("posts")
							.select(POSTS_SELECT)
							.in("id", postIds)
							.order("created_at", { ascending: false })
							.limit(50)
					: Promise.resolve({ data: [] }),
				eventIds.length > 0
					? supabase
							.from("posts")
							.select(POSTS_SELECT)
							.in("event_id", eventIds)
							.order("created_at", { ascending: false })
							.limit(50)
					: Promise.resolve({ data: [] }),
			]);

			const postsById = new Map<string, RawPost>();
			for (const post of [
				...((taggedPosts.data ?? []) as unknown as RawPost[]),
				...((eventPosts.data ?? []) as unknown as RawPost[]),
			]) {
				postsById.set(post.id, post);
			}

			return {
				data: [...postsById.values()]
					.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
					.slice(0, 50),
			};
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
