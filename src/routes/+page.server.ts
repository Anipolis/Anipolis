import { fail } from "@sveltejs/kit";
import type { MylistActivity } from "$lib/activity";
import { COLLECTION_SHARE_SELECT, type CollectionShare, isCollectionId, toCollectionShare } from "$lib/collections";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { buildPostCardSelect } from "$lib/server/post-selects";
import {
	fillTimelinePage,
	getAnimeExchangeShareForUser,
	getAnimeRankingTrending,
	getFollowingActivity,
	getFollowingTimelinePosts,
	getHomeTimelinePosts,
	getOpenBroadcastRoomSessions,
	getUserAnimeList,
	type TimelineCursor,
} from "$lib/server/queries";
import { failQuery } from "$lib/server/query-failure";
import { parseTimelineCursor } from "$lib/timeline-cursor";
import type { AnimeExchangeShare, Post } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

// どちらも CW を含む。CW を外したフォールバックはネタバレ本文を出してしまうので用意しない（#317）
const POSTS_SELECT_WITH_EXCHANGE = buildPostCardSelect({ exchangeShare: true });
const POSTS_SELECT_BASE = buildPostCardSelect({ exchangeShare: false });

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession }, parent }) => {
	// parent()を早めに発火（まだawaitしない）し、キャッシュ済みのsafeGetSessionでuserを並列取得
	const [{ profile }, { user }] = await Promise.all([parent(), safeGetSession()]);

	const tabParam = url.searchParams.get("tab");
	const tab: "all" | "following" | "activity" =
		user && (tabParam === "following" || tabParam === "activity") ? tabParam : "all";
	const quoteAnimeId = url.searchParams.get("quote_anime");
	const shareExchangeId = url.searchParams.get("share_exchange");
	const shareCollectionId = url.searchParams.get("share_collection");
	// before / before_id は PostgREST のフィルタに埋め込むので、形を厳密に確かめる（#243）
	const before = parseTimelineCursor(url.searchParams);
	// 続きの有無（nextCursor）はミュート除外前の取得行から決める。除外後の件数で判定すると
	// ミュートで減ったページが「続きなし」になり、古い投稿へ進めなくなる（#35）。
	type TimelinePage = { posts: Post[]; nextCursor: TimelineCursor | null };
	// 1ページ分（除外前 50 件）を取る。交換シェアの列で失敗したら、その列なしで取り直す
	const fetchTimelineBatch = async (cursor: TimelineCursor | undefined) => {
		if (tab === "following" && user) {
			let lastError: unknown = null;
			for (const select of [POSTS_SELECT_WITH_EXCHANGE, POSTS_SELECT_BASE]) {
				const result = await getFollowingTimelinePosts(supabase, user.id, {
					select,
					limit: 50,
					...(cursor ? { before: cursor.createdAt, beforeId: cursor.id } : {}),
				});
				if (!result.error) return result;
				lastError = result.error;
			}
			console.error("following timeline posts query failed for all select fallbacks");
			return { posts: [], error: lastError, nextCursor: null };
		}

		const result = await getHomeTimelinePosts(supabase, user?.id ?? null, {
			select: POSTS_SELECT_WITH_EXCHANGE,
			limit: 50,
			...(cursor ? { cursor } : {}),
		});
		if (!result.error) return result;

		const baseFallback = await getHomeTimelinePosts(supabase, user?.id ?? null, {
			select: POSTS_SELECT_BASE,
			limit: 50,
			...(cursor ? { cursor } : {}),
		});
		if (baseFallback.error) console.error("home posts query failed:", baseFallback.error);
		return baseFallback;
	};
	const fetchTimeline = async (): Promise<TimelinePage> => {
		// ミュートで数件しか残らないページは、続きを取り足して埋める
		const page = await fillTimelinePage(fetchTimelineBatch, before);
		// 取得の失敗を「投稿がありません」と見せない。Promise を失敗させ、画面の再読み込みの表示に任せる（#262）
		if (page.error) failQuery(`homeTimeline:${tab}`, page.error);
		return { posts: page.posts, nextCursor: page.nextCursor };
	};

	// アクティビティ（181）: フォロー中の人のマイリストの動き。ミュートで減ったページは投稿と同じく取り足す
	type ActivityPage = { items: MylistActivity[]; nextCursor: TimelineCursor | null };
	const fetchActivity = async (): Promise<ActivityPage> => {
		if (!user) return { items: [], nextCursor: null };
		const page = await fillTimelinePage(
			(cursor) => getFollowingActivity(supabase, user.id, cursor ? { before: cursor } : {}),
			before,
		);
		if (page.error) failQuery("homeTimeline:activity", page.error);
		return { items: page.posts, nextCursor: page.nextCursor };
	};

	const buildExchangeInitialContent = (_exchangeShare: AnimeExchangeShare | null) =>
		"#アニメトレード でおすすめが届きました！";

	const fetchSidebarExtras = () =>
		Promise.all([
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
			user && shareCollectionId ? getOwnPublicCollectionShare(user.id, shareCollectionId) : Promise.resolve(null),
			// 視聴中の作品は投稿欄の補助。読めなくても投稿欄は出す（失敗は failQuery がログに残す）
			user ? getUserAnimeList(supabase, user.id, "watching").catch(() => []) : Promise.resolve([]),
			user ? getOpenBroadcastRoomSessions(supabase, { kind: "episode" }) : Promise.resolve([]),
			user ? isNewcomer(user.id) : Promise.resolve(false),
		] as const);

	// コレクションのシェア（193）。シェアできるのは自分の公開コレクションだけ（投稿時は DB のトリガーも確かめる）
	async function getOwnPublicCollectionShare(userId: string, collectionId: string): Promise<CollectionShare | null> {
		if (!isCollectionId(collectionId)) return null;
		const { data } = await supabase
			.from("user_collections")
			.select(COLLECTION_SHARE_SELECT)
			.eq("id", collectionId)
			.eq("user_id", userId)
			.eq("is_public", true)
			.maybeSingle();
		return toCollectionShare(data);
	}

	// まだ誰もフォローしておらず、マイリストも空の人（ホームで最初にやることを案内する）。読めなければ案内しない
	async function isNewcomer(userId: string): Promise<boolean> {
		const [following, list] = await Promise.all([
			supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId),
			supabase.from("user_anime_list").select("anime_id", { count: "exact", head: true }).eq("user_id", userId),
		]);
		if (following.error || list.error) return false;
		return (following.count ?? 0) === 0 && (list.count ?? 0) === 0;
	}

	// 遷移の初期レスポンスではページ枠だけを返し、タイムラインと右カラムは
	// ストリーミングで後から解決する。サイドバーからの遷移で、複数の
	// Supabase クエリが終わるまで前画面に留まらないための境界である。
	const pageExtras = fetchSidebarExtras().then(
		([
			trendingResult,
			animeTrending,
			quoteAnimeResult,
			exchangeShare,
			collectionShare,
			watchingAnime,
			liveRooms,
			newcomer,
		]) => ({
			newcomer,
			trending: trendingResult.data ?? [],
			animeTrending,
			liveRooms,
			initialAnime: quoteAnimeResult.data
				? { ...quoteAnimeResult.data, id: String(quoteAnimeResult.data.id) }
				: null,
			initialExchangeId: exchangeShare ? shareExchangeId : null,
			initialExchangeShare: exchangeShare,
			initialCollectionShare: collectionShare,
			initialContent: exchangeShare ? buildExchangeInitialContent(exchangeShare) : "",
			watchingAnime: watchingAnime.slice(0, 5).map((a) => ({
				id: a.id,
				title: a.title,
				title_en: a.title_en ?? null,
				cover_url: a.cover_url ?? null,
			})),
		}),
	);

	return {
		// アクティビティのタブでは投稿を読まない
		timeline: tab === "activity" ? Promise.resolve<TimelinePage>({ posts: [], nextCursor: null }) : fetchTimeline(),
		activity: tab === "activity" ? fetchActivity() : null,
		pageExtras,
		profile,
		user,
		tab,
		before: before?.createdAt ?? null,
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
		const collectionId = (form.get("collection_id") as string | null)?.trim() || null;
		if (collectionId && !isCollectionId(collectionId)) {
			return fail(400, { message: "シェアするコレクションが見つかりません" });
		}
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
			[],
			null,
			null,
			collectionId,
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
