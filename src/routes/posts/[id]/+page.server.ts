import type { SupabaseClient } from "@supabase/supabase-js";
import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import { enrichPostsWithCounts, getAnimeRankingTrending } from "$lib/server/queries";
import type { RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = buildPostCardSelect();

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	// biome-ignore lint/suspicious/noExplicitAny: migration 061 columns are not present in generated Supabase types yet
	const postReader = supabase as SupabaseClient<any>;

	const { data: rawPost } = await postReader.from("posts").select(POSTS_SELECT).eq("id", params.id).maybeSingle();

	if (!rawPost) error(404, "投稿が見つかりません");
	const post = rawPost as unknown as RawPost;

	// 親投稿・リプライを並列取得
	const [rawParentRes, rawRepliesRes, trendingResult, animeTrending] = await Promise.all([
		post.parent_id
			? postReader.from("posts").select(POSTS_SELECT).eq("id", post.parent_id).maybeSingle()
			: Promise.resolve({ data: null }),

		postReader
			.from("posts")
			.select(POSTS_SELECT)
			.eq("parent_id", params.id)
			.order("created_at", { ascending: true }),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	const rawParent = rawParentRes.data;
	const rawReplies = rawRepliesRes.data ?? [];

	// 全投稿を一度に enrich（バッチクエリを最小化）
	const rawAll = [post, ...(rawParent ? [rawParent] : []), ...rawReplies] as unknown as RawPost[];
	const enriched = await enrichPostsWithCounts(supabase, rawAll, user?.id ?? null, { includeMutedRoomPosts: true });

	const enrichedPost = enriched.find((p) => p.id === params.id);
	if (!enrichedPost) error(404, "投稿が見つかりません");
	const enrichedParent = post.parent_id ? (enriched.find((p) => p.id === post.parent_id) ?? null) : null;
	const enrichedReplies = enriched.filter((p) => p.id !== params.id && p.id !== post.parent_id);

	return {
		post: enrichedPost,
		parentPost: enrichedParent,
		replies: enrichedReplies,
		currentUserId: user?.id ?? null,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};

export const actions: Actions = {
	reply: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		const imageUrlsRaw = (form.get("image_urls") as string | null) ?? "[]";
		const animeId = (form.get("anime_id") as string | null)?.trim() || null;
		let imageUrls: string[] = [];
		try {
			imageUrls = JSON.parse(imageUrlsRaw);
		} catch {
			imageUrls = [];
		}
		return insertPostWithHashtags(supabase, user.id, content, params.id, imageUrls, animeId);
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
