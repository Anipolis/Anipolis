import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import { enrichPostsWithCounts } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const query = url.searchParams.get("q")?.trim() ?? "";

	if (!query) {
		return { query: "", posts: [], users: [], user };
	}

	const pattern = `%${query}%`;

	const [postsResult, usersResult] = await Promise.all([
		supabase
			.from("posts")
			.select(
				`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
                 profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
                 post_hashtags ( hashtags ( name ) ),
                 anime:anime!posts_anime_id_fkey ( id, title, cover_url, broadcast_day, broadcast_time )`,
			)
			.ilike("content", pattern)
			.order("created_at", { ascending: false })
			.limit(30),

		supabase
			.from("profiles")
			.select("id, username, display_name, avatar_url")
			.or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
			.limit(10),
	]);

	const posts = await enrichPostsWithCounts(supabase, postsResult.data ?? [], user?.id ?? null);

	return {
		query,
		posts,
		users: usersResult.data ?? [],
		user,
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
