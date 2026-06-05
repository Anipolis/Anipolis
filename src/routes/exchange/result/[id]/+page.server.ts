import { error } from "@sveltejs/kit";
import { getAnimeRankingTrending } from "$lib/server/queries";
import type { AnimeExchangeShare } from "$lib/types";
import type { PageServerLoad } from "./$types";

type ExchangeShareRaw = {
	type?: unknown;
	offered_anime?: unknown;
	received_anime?: unknown;
};

type ExchangeShareAnimeRaw = {
	id?: unknown;
	title?: unknown;
	title_en?: unknown;
	cover_url?: unknown;
};

function toExchangeShare(value: unknown): AnimeExchangeShare | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as ExchangeShareRaw;
	if (raw.type !== "anime_exchange") return null;
	const offered = toExchangeShareAnime(raw.offered_anime);
	const received = toExchangeShareAnime(raw.received_anime);
	if (!offered || !received) return null;
	return {
		type: "anime_exchange",
		offered_anime: offered,
		received_anime: received,
	};
}

function toExchangeShareAnime(value: unknown): AnimeExchangeShare["offered_anime"] | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as ExchangeShareAnimeRaw;
	if (raw.id == null || typeof raw.title !== "string") return null;
	return {
		id: String(raw.id),
		title: raw.title,
		title_en: typeof raw.title_en === "string" ? raw.title_en : null,
		cover_url: typeof raw.cover_url === "string" ? raw.cover_url : null,
	};
}

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const [postResult, trendingResult, animeTrending] = await Promise.all([
		supabase
			.from("posts")
			.select(`
			id,
			created_at,
			exchange_share,
			profiles!posts_user_id_fkey (
				username,
				display_name,
				avatar_url
			)
		`)
			.eq("id", params.id)
			.maybeSingle(),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);
	const post = postResult.data;

	const exchangeShare = toExchangeShare(post?.exchange_share);
	if (!post || !exchangeShare) error(404, "交換結果が見つかりません");

	const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

	return {
		postId: post.id,
		createdAt: post.created_at,
		exchangeShare,
		author: {
			username: profile?.username ?? "unknown",
			display_name: profile?.display_name ?? null,
			avatar_url: profile?.avatar_url ?? null,
		},
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};
