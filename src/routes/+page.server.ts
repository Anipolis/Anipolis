import { fail } from "@sveltejs/kit";
import {
	deletePostAction,
	insertPostWithHashtags,
	toggleBookmarkAction,
	toggleLikeAction,
	toggleRepostAction,
} from "$lib/server/actions";
import { enrichPostsWithCounts, getAnimeExchangeShareForUser, getFollowingIds } from "$lib/server/queries";
import type { AnimeExchangeShare, Post, RawPost } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

// exchange_share カラムは migration 034 で追加済み（IF NOT EXISTS付き）。
// カラムは確実に存在するため、フォールバック用の POSTS_SELECT_BASE は不要。
const POSTS_SELECT = `id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
	profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
	post_hashtags ( hashtags ( name ) ),
	anime:anime!posts_anime_id_fkey ( id, title, cover_url )`;

export const load: PageServerLoad = async ({ url, locals: { supabase }, parent }) => {
	const { profile, user } = await parent();

	const tab = url.searchParams.get("tab") === "following" && user ? "following" : "all";
	const quoteAnimeId = url.searchParams.get("quote_anime");
	const shareExchangeId = url.searchParams.get("share_exchange");

	const buildExchangeInitialContent = (exchangeShare: AnimeExchangeShare | null) =>
		exchangeShare?.received_anime.title
			? `アニメ交換で「${exchangeShare.received_anime.title}」がおすすめとして届きました！ #アニメ交換`
			: "アニメ交換でおすすめが届きました！ #アニメ交換";

	// ── Stage 1: 全独立クエリを並列実行 ────────────────────────────
	// followingIds・trending・quoteAnime・exchangeShare は互いに依存しないため
	// 同一 Promise.all でまとめて発火し、ウォーターフォールを排除する
	const [followingIds, trendingResult, quoteAnimeResult, exchangeShare] = await Promise.all([
		tab === "following" && user ? getFollowingIds(supabase, user.id) : Promise.resolve(null),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		quoteAnimeId
			? supabase.from("anime").select("id, title, title_en, cover_url").eq("id", Number(quoteAnimeId)).single()
			: Promise.resolve({ data: null }),
		user && shareExchangeId
			? getAnimeExchangeShareForUser(supabase, user.id, shareExchangeId)
			: Promise.resolve(null),
	]);

	// ── Stage 2: 投稿クエリを deferred Promise として返す ──────────
	// await しないことで SvelteKit のストリーミング機能を利用する。
	// サーバーはページ HTML を即時送信し、投稿データは解決次第チャンクで流す。
	// クライアント側では {#await data.posts} でスケルトン → 実データに切り替える。
	// フォロー中タブで誰もフォローしていない場合は即時空配列
	const postsPromise: Promise<Post[]> =
		tab === "following" && followingIds !== null && followingIds.length === 0
			? Promise.resolve([])
			: (async () => {
					let postsQuery = supabase
						.from("posts")
						.select(POSTS_SELECT)
						.is("parent_id", null)
						.order("created_at", { ascending: false })
						.limit(50);

					if (tab === "following" && followingIds !== null) {
						postsQuery = postsQuery.in("user_id", followingIds);
					}

					const postsResult = await postsQuery;
					return enrichPostsWithCounts(
						supabase,
						(postsResult.data ?? []) as unknown as RawPost[],
						user?.id ?? null,
					);
				})().catch((err) => {
					// 投稿取得に失敗しても page crash を防ぐ。エラーはサーバーログに記録。
					console.error("[home] posts fetch error:", err);
					return [] as Post[];
				});

	return {
		posts: postsPromise,
		trending: trendingResult.data ?? [],
		profile,
		tab,
		initialAnime: quoteAnimeResult.data ? { ...quoteAnimeResult.data, id: String(quoteAnimeResult.data.id) } : null,
		initialExchangeId: exchangeShare ? shareExchangeId : null,
		initialExchangeShare: exchangeShare,
		initialContent: exchangeShare ? buildExchangeInitialContent(exchangeShare) : "",
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
