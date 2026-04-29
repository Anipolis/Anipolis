import { error, fail } from "@sveltejs/kit";
import { deletePostAction, insertPostWithHashtags, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { enrichPostsWithCounts } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = `
    id, content, created_at, user_id, parent_id, image_urls,
    profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
    post_hashtags ( hashtags ( name ) )
` as const;

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const { data: rawPost } = await supabase.from("posts").select(POSTS_SELECT).eq("id", params.id).maybeSingle();

	if (!rawPost) error(404, "投稿が見つかりません");

	// 親投稿・リプライを並列取得
	const [rawParentRes, rawRepliesRes] = await Promise.all([
		rawPost.parent_id
			? supabase.from("posts").select(POSTS_SELECT).eq("id", rawPost.parent_id).maybeSingle()
			: Promise.resolve({ data: null }),

		supabase.from("posts").select(POSTS_SELECT).eq("parent_id", params.id).order("created_at", { ascending: true }),
	]);

	const rawParent = rawParentRes.data;
	const rawReplies = rawRepliesRes.data ?? [];

	// 全投稿を一度に enrich（バッチクエリを最小化）
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const rawAll: any[] = [rawPost, ...(rawParent ? [rawParent] : []), ...rawReplies];
	const enriched = await enrichPostsWithCounts(supabase, rawAll, user?.id ?? null);

	const enrichedPost = enriched.find((p) => p.id === params.id)!;
	const enrichedParent = rawPost.parent_id ? (enriched.find((p) => p.id === rawPost.parent_id) ?? null) : null;
	const enrichedReplies = enriched.filter((p) => p.id !== params.id && p.id !== rawPost.parent_id);

	return {
		post: enrichedPost,
		parentPost: enrichedParent,
		replies: enrichedReplies,
		currentUserId: user?.id ?? null,
	};
};

export const actions: Actions = {
	reply: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		const imageUrlsRaw = (form.get("image_urls") as string | null) ?? "[]";
		let imageUrls: string[] = [];
		try {
			imageUrls = JSON.parse(imageUrlsRaw);
		} catch {
			imageUrls = [];
		}
		return insertPostWithHashtags(supabase, user.id, content, params.id, imageUrls);
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
};
