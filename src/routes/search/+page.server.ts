import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import { deletePostAction, toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "$lib/server/actions";
import {
	ANIME_SECTION_LIMIT,
	type AnimeSearchHit,
	buildPostSearchFilter,
	buildTitlePrefixFilter,
	MAX_ANIME_MATCHES,
	mergeRankedAnimeMatches,
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
		return {
			query: "",
			posts: [],
			users: [],
			animeMatches: emptyAnimeMatches(),
			user,
			trending: trendingResult.data ?? [],
			animeTrending,
		};
	}

	// ユーザー検索は "@name" の @ を外して照合する（投稿検索は入力どおり: メンションを含む本文が引ける）
	const accountQuery = normalizeAccountQuery(query);
	const accountPattern = accountQuery ? buildIlikeContainsPattern(accountQuery) : null;

	// 検索語に一致する作品。投稿検索で「その作品の引用投稿」も拾うのと、結果上部の作品一覧に使う。
	// 多すぎる判定のため上限 + 1 件まで取る
	const animeHitsPromise: Promise<AnimeRow[]> = shouldMatchQuotedAnime(query)
		? fetchAnimeRows(supabase, buildTitleSearchFilter(query), false)
		: Promise.resolve([]);

	const postsPromise = animeHitsPromise.then((animeRows) => {
		const animeIds = quotedAnimeIdsForSearch(animeRows);
		return supabase
			.from("posts")
			.select(POSTS_SELECT)
			.or(buildPostSearchFilter(query, animeIds))
			.order("created_at", { ascending: false })
			.limit(30);
	});

	// 一致が多すぎると部分一致の取得は題名順の先頭で打ち切られ、完全一致・前方一致の作品が
	// 漏れ得る。その場合だけ前方一致の作品を公開中に絞って別に取得し、一覧の上位を決める
	const prefixHitsPromise: Promise<AnimeRow[]> = animeHitsPromise.then((animeRows) =>
		animeRows.length > MAX_ANIME_MATCHES ? fetchAnimeRows(supabase, buildTitlePrefixFilter(query), true) : [],
	);

	const [animeRows, prefixRows, postsResult, usersResult, trendingResult, animeTrending] = await Promise.all([
		animeHitsPromise,
		prefixHitsPromise,
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
		animeMatches: summarizeAnimeMatches(query, animeRows, prefixRows),
		user,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};

type AnimeRow = AnimeSearchHit & { metadata_ready: boolean; hidden_by_admin: boolean };

const ANIME_MATCH_SELECT = "id, title, title_en, title_yomi, cover_url, metadata_ready, hidden_by_admin";
const MAX_ANIME_HITS_FETCH = MAX_ANIME_MATCHES + 1;

/**
 * 検索語に一致する作品を最大 MAX_ANIME_HITS_FETCH 件取る（多すぎる判定のため上限 + 1）。
 * 取得に失敗したら空（= 本文一致だけで検索する）。visibleOnly は一覧用に公開中の作品に絞る。
 */
async function fetchAnimeRows(supabase: SupabaseClient, filter: string, visibleOnly: boolean): Promise<AnimeRow[]> {
	// biome-ignore lint/suspicious/noExplicitAny: anime.title_yomi (migration 125) is not in the generated types yet (#216)
	const reader = supabase as SupabaseClient<any>;
	let query = reader.from("anime").select(ANIME_MATCH_SELECT).or(filter);
	if (visibleOnly) query = query.eq("metadata_ready", true).eq("hidden_by_admin", false);
	const { data, error } = await query.order("title", { ascending: true }).limit(MAX_ANIME_HITS_FETCH);
	if (error) {
		console.error("anime lookup for post search failed:", error.message);
		return [];
	}
	return (data ?? []) as AnimeRow[];
}

type AnimeMatches = {
	/** 結果上部に出す作品（公開中のものだけ、並べ替え済み） */
	items: AnimeSearchHit[];
	/** 公開中で一致した作品の総数（表示件数を超える分は「アニメ一覧で見る」へ） */
	total: number;
	/** 一致が多すぎて、作品の引用では投稿を探さなかった */
	tooMany: boolean;
};

function emptyAnimeMatches(): AnimeMatches {
	return { items: [], total: 0, tooMany: false };
}

function toVisibleHits(rows: AnimeRow[]): AnimeSearchHit[] {
	// 投稿との照合には非公開・未整備の作品も含めるが、一覧には出さない
	return rows
		.filter((row) => row.metadata_ready && !row.hidden_by_admin)
		.map(({ id, title, title_en, title_yomi, cover_url }) => ({
			id,
			title,
			title_en,
			title_yomi: title_yomi ?? null,
			cover_url,
		}));
}

function summarizeAnimeMatches(query: string, rows: AnimeRow[], prefixRows: AnimeRow[]): AnimeMatches {
	const visible = toVisibleHits(rows);
	// 前方一致の別取得（一致が多すぎたときだけ）を先に、部分一致の先頭で埋める
	const ranked = mergeRankedAnimeMatches(query, toVisibleHits(prefixRows), visible);
	return {
		// 読みは並べ替えにだけ使い、ページには渡さない
		items: ranked.slice(0, ANIME_SECTION_LIMIT).map(({ id, title, title_en, cover_url }) => ({
			id,
			title,
			title_en,
			cover_url,
		})),
		total: visible.length,
		tooMany: rows.length > MAX_ANIME_MATCHES,
	};
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
