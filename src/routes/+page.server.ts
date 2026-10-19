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
	fillTimelinePage,
	getAnimeExchangeShareForUser,
	getFollowingTimelinePosts,
	getHomeTimelinePosts,
	type TimelineCursor,
} from "$lib/server/queries";
import type { AnimeExchangeShare, Post } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

// どちらも CW を含む。CW を外したフォールバックはネタバレ本文を出してしまうので用意しない（#317）
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
	// 続きの有無（nextCursor）はミュート除外前の取得行から決める。除外後の件数で判定すると
	// ミュートで減ったページが「続きなし」になり、古い投稿へ進めなくなる（#35）。
	type TimelinePage = { posts: Post[]; nextCursor: TimelineCursor | null };
	// 1ページ分（除外前 50 件）を取る。交換シェアの列で失敗したら、その列なしで取り直す
	const fetchTimelineBatch = async (targetTab: "all" | "following", cursor: TimelineCursor | undefined) => {
		if (targetTab === "following" && user) {
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
	const fetchTimeline = async (targetTab: "all" | "following", cursor?: TimelineCursor): Promise<TimelinePage> => {
		// ミュートで数件しか残らないページは、タブごとに続きを取り足して埋める
		const page = await fillTimelinePage((nextCursor) => fetchTimelineBatch(targetTab, nextCursor), cursor);
		return { posts: page.posts, nextCursor: page.nextCursor };
	};

	const buildExchangeInitialContent = (_exchangeShare: AnimeExchangeShare | null) =>
		"#アニメトレード でおすすめが届きました！";

	const fetchComposerExtras = () =>
		Promise.all([
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
		] as const);

	// 遷移の初期レスポンスではページ枠だけを返し、タイムラインと右カラムは
	// ストリーミングで後から解決する。サイドバーからの遷移で、複数の
	// Supabase クエリが終わるまで前画面に留まらないための境界である。
	const pageExtras = fetchComposerExtras().then(([quoteAnimeResult, exchangeShare]) => ({
		initialAnime: quoteAnimeResult.data ? { ...quoteAnimeResult.data, id: String(quoteAnimeResult.data.id) } : null,
		initialExchangeId: exchangeShare ? shareExchangeId : null,
		initialExchangeShare: exchangeShare,
		initialContent: exchangeShare ? buildExchangeInitialContent(exchangeShare) : "",
	}));

	return {
		timeline: fetchTimeline(tab, before),
		// 両タブをストリーミングで先読みし、切替自体では load を再実行しない。
		// 未ログインではフォロー一覧を取得しない。カーソルは表示中のタブだけに適用する。
		alternateTimeline: user ? fetchTimeline(tab === "all" ? "following" : "all") : null,
		pageExtras,
		profile,
		user,
		tab,
		before: before?.createdAt ?? null,
		beforeId: before?.id ?? null,
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
