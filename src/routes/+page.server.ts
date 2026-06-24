import { fail, redirect } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import {
	enrichPostsWithCounts,
	getAnimeExchangeShareForUser,
	getAnimeRankingTrending,
	getFollowingProfiles,
	getTimelinePostsWithReposts,
	getUserAnimeList,
} from "$lib/server/queries";
import type { AnimeExchangeShare, Post, RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT_WITH_EXCHANGE_AND_CW = buildPostCardSelect({ exchangeShare: true, cwAnime: true });
const POSTS_SELECT_WITH_EXCHANGE = buildPostCardSelect({ exchangeShare: true });
const POSTS_SELECT_BASE = buildPostCardSelect({ exchangeShare: false });

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession }, parent }) => {
	// parent()を早めに発火（まだawaitしない）し、キャッシュ済みのsafeGetSessionでuserを並列取得
	const [{ profile }, { user }] = await Promise.all([parent(), safeGetSession()]);

	if (!user) redirect(303, `/auth?next=${encodeURIComponent("/")}`);

	const tab = url.searchParams.get("tab") === "following" && user ? "following" : "all";
	const quoteAnimeId = url.searchParams.get("quote_anime");
	const shareExchangeId = url.searchParams.get("share_exchange");
	const followingProfiles = tab === "following" && user ? await getFollowingProfiles(supabase, user.id) : null;

	const buildPostsQuery = (select: string) => {
		return supabase
			.from("posts")
			.select(select)
			.is("parent_id", null)
			.order("created_at", { ascending: false })
			.limit(50);
	};

	const fetchPosts = async (): Promise<Post[]> => {
		if (tab === "following" && followingProfiles !== null) {
			for (const select of [POSTS_SELECT_WITH_EXCHANGE_AND_CW, POSTS_SELECT_WITH_EXCHANGE, POSTS_SELECT_BASE]) {
				const result = await getTimelinePostsWithReposts(supabase, followingProfiles, user?.id ?? null, {
					select,
					limit: 50,
				});
				if (!result.error) return result.posts;
			}
			console.error("following timeline posts query failed for all select fallbacks");
			return [];
		}

		const result = await buildPostsQuery(POSTS_SELECT_WITH_EXCHANGE_AND_CW);
		if (!result.error) {
			return enrichPostsWithCounts(
				supabase,
				Array.isArray(result.data) ? (result.data as unknown as RawPost[]) : [],
				user?.id ?? null,
			);
		}

		const exchangeFallback = await buildPostsQuery(POSTS_SELECT_WITH_EXCHANGE);
		if (!exchangeFallback.error) {
			return enrichPostsWithCounts(
				supabase,
				Array.isArray(exchangeFallback.data) ? (exchangeFallback.data as unknown as RawPost[]) : [],
				user?.id ?? null,
			);
		}

		const baseFallback = await buildPostsQuery(POSTS_SELECT_BASE);
		if (baseFallback.error) console.error("home posts query failed:", baseFallback.error);
		return enrichPostsWithCounts(
			supabase,
			Array.isArray(baseFallback.data) ? (baseFallback.data as unknown as RawPost[]) : [],
			user?.id ?? null,
		);
	};

	const buildExchangeInitialContent = (exchangeShare: AnimeExchangeShare | null) =>
		exchangeShare?.received_anime.title
			? `アニメトレードで「${exchangeShare.received_anime.title}」がおすすめとして届きました！ #アニメトレード`
			: "アニメトレードでおすすめが届きました！ #アニメトレード";

	if (tab === "following" && followingProfiles !== null && followingProfiles.length === 0) {
		const [trendingResult, animeTrending, quoteAnimeResult, exchangeShare, watchingAnime] = await Promise.all([
			supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
			getAnimeRankingTrending(supabase, 5),
			quoteAnimeId
				? supabase
						.from("anime")
						.select("id, title, title_en, cover_url, official_hashtag")
						.eq("id", Number(quoteAnimeId))
						.single()
				: Promise.resolve({ data: null }),
			user && shareExchangeId
				? getAnimeExchangeShareForUser(supabase, user.id, shareExchangeId)
				: Promise.resolve(null),
			user ? getUserAnimeList(supabase, user.id, "watching") : Promise.resolve([]),
		]);
		return {
			posts: [],
			trending: trendingResult.data ?? [],
			animeTrending,
			profile,
			tab,
			initialAnime: quoteAnimeResult.data
				? { ...quoteAnimeResult.data, id: String(quoteAnimeResult.data.id) }
				: null,
			initialExchangeId: exchangeShare ? shareExchangeId : null,
			initialExchangeShare: exchangeShare,
			initialContent: exchangeShare ? buildExchangeInitialContent(exchangeShare) : "",
			watchingAnime: watchingAnime.slice(0, 5).map((a) => ({
				id: a.id,
				title: a.title,
				title_en: a.title_en ?? null,
				cover_url: a.cover_url ?? null,
			})),
		};
	}

	const [posts, trendingResult, animeTrending, quoteAnimeResult, exchangeShare, watchingAnime] = await Promise.all([
		fetchPosts(),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
		quoteAnimeId
			? supabase
					.from("anime")
					.select("id, title, title_en, cover_url, official_hashtag")
					.eq("id", Number(quoteAnimeId))
					.single()
			: Promise.resolve({ data: null }),
		user && shareExchangeId
			? getAnimeExchangeShareForUser(supabase, user.id, shareExchangeId)
			: Promise.resolve(null),
		user ? getUserAnimeList(supabase, user.id, "watching") : Promise.resolve([]),
	]);

	return {
		posts,
		trending: trendingResult.data ?? [],
		animeTrending,
		profile,
		tab,
		initialAnime: quoteAnimeResult.data ? { ...quoteAnimeResult.data, id: String(quoteAnimeResult.data.id) } : null,
		initialExchangeId: exchangeShare ? shareExchangeId : null,
		initialExchangeShare: exchangeShare,
		initialContent: exchangeShare ? buildExchangeInitialContent(exchangeShare) : "",
		watchingAnime: watchingAnime
			.slice(0, 5)
			.map((a) => ({ id: a.id, title: a.title, title_en: a.title_en ?? null, cover_url: a.cover_url ?? null })),
	};
};

export const actions: Actions = {
	createPost: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const content = (form.get("content") as string | null)?.trim() ?? "";
		const imageUrlsRaw = (form.get("image_urls") as string | null) ?? "[]";
		const animeId = (form.get("anime_id") as string | null)?.trim() || null;
		const cwAnimeId = (form.get("cw_anime_id") as string | null)?.trim() || null;
		const exchangeId = (form.get("exchange_id") as string | null)?.trim() || null;
		let imageUrls: string[] = [];
		try {
			imageUrls = JSON.parse(imageUrlsRaw);
		} catch {
			imageUrls = [];
		}
		const exchangeShare = exchangeId ? await getAnimeExchangeShareForUser(supabase, user.id, exchangeId) : null;
		if (exchangeId && !exchangeShare) return fail(404, { message: "共有する交換結果が見つかりません" });

		return insertPostWithHashtags(
			supabase,
			user.id,
			content,
			null,
			imageUrls,
			exchangeShare?.received_anime.id ?? animeId,
			null,
			exchangeShare,
			null,
			cwAnimeId,
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
