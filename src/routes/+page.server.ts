import { fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import {
	getAnimeExchangeShareForUser,
	getAnimeRankingTrending,
	getFollowingProfiles,
	getHomeTimelinePosts,
	getOpenBroadcastRoomSessions,
	getTimelinePostsWithReposts,
	getUserAnimeList,
} from "$lib/server/queries";
import type { AnimeExchangeShare, Post } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

const POSTS_SELECT_WITH_EXCHANGE_AND_CW = buildPostCardSelect({ exchangeShare: true, cwAnime: true });
const POSTS_SELECT_WITH_EXCHANGE = buildPostCardSelect({ exchangeShare: true });
const POSTS_SELECT_BASE = buildPostCardSelect({ exchangeShare: false });

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession }, parent }) => {
	// parent()を早めに発火（まだawaitしない）し、キャッシュ済みのsafeGetSessionでuserを並列取得
	const [{ profile }, { user }] = await Promise.all([parent(), safeGetSession()]);

	const tab = url.searchParams.get("tab") === "following" && user ? "following" : "all";
	const quoteAnimeId = url.searchParams.get("quote_anime");
	const shareExchangeId = url.searchParams.get("share_exchange");
	const beforeParam = url.searchParams.get("before") ?? undefined;
	const beforeIdParam = url.searchParams.get("before_id") ?? undefined;
	const before =
		beforeParam && beforeIdParam && /^\d{4}-\d{2}-\d{2}T/.test(beforeParam)
			? { createdAt: beforeParam, id: beforeIdParam }
			: undefined;
	const followingProfiles = tab === "following" && user ? await getFollowingProfiles(supabase, user.id) : null;

	const fetchPosts = async (): Promise<Post[]> => {
		if (tab === "following" && followingProfiles !== null) {
			for (const select of [POSTS_SELECT_WITH_EXCHANGE_AND_CW, POSTS_SELECT_WITH_EXCHANGE, POSTS_SELECT_BASE]) {
				const result = await getTimelinePostsWithReposts(supabase, followingProfiles, user?.id ?? null, {
					select,
					limit: 50,
					...(before ? { before: before.createdAt, beforeId: before.id } : {}),
				});
				if (!result.error) return result.posts;
			}
			console.error("following timeline posts query failed for all select fallbacks");
			return [];
		}

		const result = await getHomeTimelinePosts(supabase, user?.id ?? null, {
			select: POSTS_SELECT_WITH_EXCHANGE_AND_CW,
			limit: 50,
			...(before ? { cursor: before } : {}),
		});
		if (!result.error) {
			return result.posts;
		}

		const exchangeFallback = await getHomeTimelinePosts(supabase, user?.id ?? null, {
			select: POSTS_SELECT_WITH_EXCHANGE,
			limit: 50,
			...(before ? { cursor: before } : {}),
		});
		if (!exchangeFallback.error) {
			return exchangeFallback.posts;
		}

		const baseFallback = await getHomeTimelinePosts(supabase, user?.id ?? null, {
			select: POSTS_SELECT_BASE,
			limit: 50,
			...(before ? { cursor: before } : {}),
		});
		if (baseFallback.error) console.error("home posts query failed:", baseFallback.error);
		return baseFallback.posts;
	};

	const buildExchangeInitialContent = (_exchangeShare: AnimeExchangeShare | null) =>
		"#アニメトレード でおすすめが届きました！";

	if (tab === "following" && followingProfiles !== null && followingProfiles.length === 0) {
		const [trendingResult, animeTrending, quoteAnimeResult, exchangeShare, watchingAnime, liveRooms] =
			await Promise.all([
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
				user ? getOpenBroadcastRoomSessions(supabase, { kind: "episode" }) : Promise.resolve([]),
			]);
		return {
			posts: [],
			trending: trendingResult.data ?? [],
			animeTrending,
			liveRooms,
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

	const [posts, trendingResult, animeTrending, quoteAnimeResult, exchangeShare, watchingAnime, liveRooms] =
		await Promise.all([
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
			user ? getOpenBroadcastRoomSessions(supabase, { kind: "episode" }) : Promise.resolve([]),
		]);

	return {
		posts,
		trending: trendingResult.data ?? [],
		animeTrending,
		liveRooms,
		profile,
		tab,
		before: before?.createdAt ?? null,
		hasMore: posts.length >= 50,
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
		const broadcastRoomSessionId = (form.get("broadcast_room_session_id") as string | null)?.trim() || null;
		const exchangeId = (form.get("exchange_id") as string | null)?.trim() || null;
		let imageUrls: string[] = [];
		try {
			imageUrls = JSON.parse(imageUrlsRaw);
		} catch {
			imageUrls = [];
		}
		const exchangeShare = exchangeId ? await getAnimeExchangeShareForUser(supabase, user.id, exchangeId) : null;
		if (exchangeId && !exchangeShare) return fail(404, { message: "共有するトレード結果が見つかりません" });

		return insertPostWithHashtags(
			supabase,
			user.id,
			content,
			null,
			imageUrls,
			exchangeShare?.received_anime.id ?? animeId,
			null,
			exchangeShare,
			broadcastRoomSessionId,
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
