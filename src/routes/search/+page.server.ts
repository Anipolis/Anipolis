import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import {
	buildPostSearchFilter,
	MAX_ANIME_MATCHES,
	quotedAnimeIdsForSearch,
	shouldMatchQuotedAnime,
} from "$lib/server/post-search";
import { buildPostCardSelect } from "$lib/server/post-selects";
import {
	buildTitleSearchFilter,
	enrichPostsWithCounts,
	getAnimeRankingTrending,
	quoteOrFilterValue,
} from "$lib/server/queries";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";
import { buildIlikeContainsPattern, normalizeAccountQuery } from "$lib/utils/search";
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

	// ユーザー検索は "@name" の @ を外して照合する（投稿検索は入力どおり: メンションを含む本文が引ける）
	const accountQuery = normalizeAccountQuery(query);
	const accountPattern = accountQuery ? buildIlikeContainsPattern(accountQuery) : null;

	// 検索語に一致する作品を引いてから、本文一致に「その作品の引用投稿」を加えて投稿を検索する
	const animeIdsPromise = shouldMatchQuotedAnime(query)
		? fetchMatchingAnimeIds(supabase, query)
		: Promise.resolve([]);
	const postsPromise = animeIdsPromise.then((animeIds) =>
		supabase
			.from("posts")
			.select(POSTS_SELECT)
			.or(buildPostSearchFilter(query, animeIds))
			.order("created_at", { ascending: false })
			.limit(30),
	);

	const [postsResult, usersResult, trendingResult, animeTrending] = await Promise.all([
		postsPromise,
		accountPattern
			? supabase
					.from("profiles")
					.select("id, username, display_name, avatar_url")
					.or(
						`username.ilike.${quoteOrFilterValue(accountPattern)},display_name.ilike.${quoteOrFilterValue(accountPattern)}`,
					)
					.limit(10)
			: Promise.resolve({ data: [], error: null }),
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

/**
 * 検索語に一致する作品の ID（既存のアニメ検索と同じ条件: 日本語題・英題・読み）。
 * 多すぎる判定のため上限 + 1 件まで取り、上限を超えたら使わない（本文一致だけで検索する）。
 * 取得に失敗したときも本文一致だけにする。
 */
async function fetchMatchingAnimeIds(supabase: SupabaseClient<Database>, query: string): Promise<number[]> {
	const { data, error } = await supabase
		.from("anime")
		.select("id")
		.or(buildTitleSearchFilter(query))
		.limit(MAX_ANIME_MATCHES + 1);
	if (error) {
		console.error("anime lookup for post search failed:", error.message);
		return [];
	}
	return quotedAnimeIdsForSearch((data ?? []).map((row) => row.id));
}

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
