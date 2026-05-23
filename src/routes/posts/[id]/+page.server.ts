import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { enrichPostsWithCounts } from "$lib/server/queries";
import type { Post, RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = `
    id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
    profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
    post_hashtags ( hashtags ( name ) ),
    anime:anime!posts_anime_id_fkey ( id, title, cover_url )
` as const;

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const { data: rawPost } = await supabase.from("posts").select(POSTS_SELECT).eq("id", params.id).maybeSingle();

	if (!rawPost) error(404, "投稿が見つかりません");

	const enrichedDataPromise = (async () => {
		const [rawParentRes, rawRepliesRes] = await Promise.all([
			rawPost.parent_id
				? supabase.from("posts").select(POSTS_SELECT).eq("id", rawPost.parent_id).maybeSingle()
				: Promise.resolve({ data: null }),

			supabase.from("posts").select(POSTS_SELECT).eq("parent_id", params.id).order("created_at", { ascending: true }),
		]);

		const rawParent = rawParentRes.data;
		const rawReplies = rawRepliesRes.data ?? [];

		const rawAll: RawPost[] = [rawPost, ...(rawParent ? [rawParent] : []), ...rawReplies];
		const enriched = await enrichPostsWithCounts(supabase, rawAll, user?.id ?? null);

		const enrichedPost = enriched.find((post) => post.id === params.id);
		if (!enrichedPost) throw new Error("post not found after enrich");
		const enrichedParent = rawPost.parent_id ? (enriched.find((post) => post.id === rawPost.parent_id) ?? null) : null;
		const enrichedReplies = enriched.filter((post) => post.id !== params.id && post.id !== rawPost.parent_id);

		return {
			post: enrichedPost,
			parentPost: enrichedParent,
			replies: enrichedReplies,
		};
	})().catch((err) => {
		console.error("[posts/id] enrich error:", err);
		return { post: null as unknown as Post, parentPost: null, replies: [] as Post[] };
	});

	return {
		enrichedData: enrichedDataPromise,
		currentUserId: user?.id ?? null,
		rawPostId: params.id,
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
