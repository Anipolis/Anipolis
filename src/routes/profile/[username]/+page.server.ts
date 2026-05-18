import { error, fail } from "@sveltejs/kit";
import {
	deletePostAction,
	toggleBookmarkAction,
	toggleFollowAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import {
	checkIsFollowing,
	enrichPostsWithCounts,
	getFollowCounts,
	getFollowRequestStatus,
	getLikedPosts,
	getUserAnimeList,
} from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const { data: profile } = await supabase.from("profiles").select("*").eq("username", params.username).maybeSingle();

	if (!profile) {
		error(404, "ユーザーが見つかりません");
	}

	const isOwn = user?.id === profile.id;
	const isFollowing = user && user.id !== profile.id ? await checkIsFollowing(supabase, user.id, profile.id) : false;
	const followRequestStatus =
		user && user.id !== profile.id && !isFollowing
			? await getFollowRequestStatus(supabase, user.id, profile.id)
			: "none";
	const canViewContent = isOwn || !profile.is_private || isFollowing;

	const postSelect = `id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
                       profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
                       post_hashtags ( hashtags ( name ) ),
                       anime:anime!posts_anime_id_fkey ( id, title, cover_url )`;

	const [rawPostsResult, rawImagePostsResult, followCounts, trendingResult, animeList] = await Promise.all([
		canViewContent
			? supabase
					.from("posts")
					.select(postSelect)
					.eq("user_id", profile.id)
					.is("parent_id", null)
					.order("created_at", { ascending: false })
					.limit(50)
			: Promise.resolve({ data: [] }),

		canViewContent
			? supabase
					.from("posts")
					.select(postSelect)
					.eq("user_id", profile.id)
					.is("parent_id", null)
					.not("image_urls", "eq", "{}")
					.order("created_at", { ascending: false })
					.limit(50)
			: Promise.resolve({ data: [] }),

		getFollowCounts(supabase, profile.id),

		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),

		canViewContent && (isOwn || profile.list_is_public)
			? getUserAnimeList(supabase, profile.id)
			: Promise.resolve([]),
	]);

	const activeTab = url.searchParams.get("tab") ?? "posts";

	const [posts, imagePosts, likedPosts] = await Promise.all([
		enrichPostsWithCounts(supabase, rawPostsResult.data ?? [], user?.id ?? null),
		enrichPostsWithCounts(supabase, rawImagePostsResult.data ?? [], user?.id ?? null),
		canViewContent && activeTab === "likes"
			? getLikedPosts(supabase, profile.id, user?.id ?? null)
			: Promise.resolve([]),
	]);

	return {
		profile,
		posts,
		imagePosts,
		likedPosts,
		isOwn,
		canViewContent,
		followCounts,
		isFollowing,
		followRequestStatus,
		trending: trendingResult.data ?? [],
		animeList,
		user,
	};
};

export const actions: Actions = {
	updateProfile: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const { data: profile } = await supabase
			.from("profiles")
			.select("id")
			.eq("username", params.username)
			.maybeSingle();

		if (!profile || profile.id !== user.id) {
			return fail(403, { message: "プロフィール編集は本人だけが利用できます" });
		}

		const form = await request.formData();
		const displayName = (form.get("display_name") as string | null)?.trim() || null;
		const bio = (form.get("bio") as string | null)?.trim() || null;

		if (displayName && displayName.length > 50) {
			return fail(400, { field: "display_name", message: "表示名は50文字以内で入力してください" });
		}
		if (bio && bio.length > 160) {
			return fail(400, { field: "bio", message: "自己紹介は160文字以内で入力してください" });
		}

		const { error } = await supabase.from("profiles").update({ display_name: displayName, bio }).eq("id", user.id);

		if (error) return fail(500, { message: "プロフィールの更新に失敗しました" });

		return { success: true };
	},

	follow: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return toggleFollowAction(request, supabase, user.id);
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
