import { error, fail } from "@sveltejs/kit";
import { postImageMediaUrl } from "$lib/post-image-url";
import { postMetaDescription } from "$lib/seo";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import { enrichPostsWithCounts, getAnimeRankingTrending } from "$lib/server/queries";
import type { Post, RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT = buildPostCardSelect();

/**
 * 共有したときのカード（#271）。スレッドは後から読む（deferred）ので、クローラーにも見える
 * ここで投稿者の名前と説明文を決める。ネタバレ注意の投稿は本文も画像も出さない。
 */
function buildPostMeta(post: RawPost, origin: string) {
	const author = post.profiles?.display_name || post.profiles?.username || null;
	const hasCw = post.cw_anime_id !== null && post.cw_anime_id !== undefined;
	const firstImage = hasCw ? null : (post.image_urls?.[0] ?? null);
	return {
		title: author ? `${author}の投稿 - Anipolis` : "投稿 - Anipolis",
		description: postMetaDescription({
			content: post.content,
			hasCw,
			cwAnimeTitle: post.cw_anime?.title ?? null,
			animeTitle: post.anime?.title ?? null,
		}),
		// SNS のカード（OGP）は後から画像を取り直すことがあるので、期限付き URL ではなく
		// 閲覧権限を確かめて転送する固定リンクを出す（#316）
		image: firstImage ? new URL(postImageMediaUrl(firstImage), origin).href : null,
	};
}

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	const { data: rawPost } = await supabase.from("posts").select(POSTS_SELECT).eq("id", params.id).maybeSingle();

	if (!rawPost) error(404, "投稿が見つかりません");
	const post = rawPost as unknown as RawPost;

	const [trendingResult, animeTrending] = await Promise.all([
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	const enrichedDataPromise = (async () => {
		const [rawParentRes, rawRepliesRes] = await Promise.all([
			post.parent_id
				? supabase.from("posts").select(POSTS_SELECT).eq("id", post.parent_id).maybeSingle()
				: Promise.resolve({ data: null }),
			supabase
				.from("posts")
				.select(POSTS_SELECT)
				.eq("parent_id", params.id)
				.order("created_at", { ascending: true }),
		]);

		const rawParent = rawParentRes.data;
		const rawReplies = rawRepliesRes.data ?? [];
		const rawAll = [post, ...(rawParent ? [rawParent] : []), ...rawReplies] as unknown as RawPost[];
		const enriched = await enrichPostsWithCounts(supabase, rawAll, user?.id ?? null, {
			includeMutedRoomPosts: true,
			// ミュートした人の投稿でも、直接開いたときは見せる（返信のうち他のミュート相手は隠す）
			showMutedUserId: post.user_id,
		});
		const enrichedPost = enriched.find((item) => item.id === params.id);
		if (!enrichedPost) throw new Error("post not found after enrich");

		return {
			post: enrichedPost,
			parentPost: post.parent_id ? (enriched.find((item) => item.id === post.parent_id) ?? null) : null,
			replies: enriched.filter((item) => item.id !== params.id && item.id !== post.parent_id),
		};
	})().catch((err) => {
		console.error("[posts/id] enrich error:", err);
		return { post: null as unknown as Post, parentPost: null, replies: [] as Post[] };
	});

	return {
		enrichedData: enrichedDataPromise,
		currentUserId: user?.id ?? null,
		trending: trendingResult.data ?? [],
		animeTrending,
		post: { content: post.content },
		meta: buildPostMeta(post, url.origin),
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
		const broadcastRoomSessionId = (form.get("broadcast_room_session_id") as string | null)?.trim() || null;
		let imageUrls: string[] = [];
		try {
			imageUrls = JSON.parse(imageUrlsRaw);
		} catch {
			imageUrls = [];
		}
		return insertPostWithHashtags(
			supabase,
			user.id,
			content,
			params.id,
			imageUrls,
			animeId,
			null,
			null,
			broadcastRoomSessionId,
		);
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
