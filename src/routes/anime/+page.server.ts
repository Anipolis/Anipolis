import { fail } from "@sveltejs/kit";
import { registerAnimeAction } from "$lib/server/anime-admin";
import { buildAnimeListOptions, parseAnimeListFilters } from "$lib/server/anime-list-filters";
import {
	type AnimeListPageResult,
	countAnimeRanking,
	countUserAnimeList,
	getAnimeListPage,
	getAnimeRankingPopularity,
	getAnimeRankingTopRated,
	getAnimeRankingTrending,
	getUserAnimeList,
	isAdminUser,
} from "$lib/server/queries";
import type { Anime, AnimeListItem } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

/** Anime 全フィールドを HTML に埋め込まず、カード描画に必要な9フィールドだけへ射影する。 */
function toAnimeListItem(a: Anime): AnimeListItem {
	return {
		id: a.id,
		title: a.title,
		title_en: a.title_en,
		cover_url: a.cover_url,
		season: a.season,
		episode_count: a.episode_count,
		broadcast_day: a.broadcast_day,
		computed_broadcast_status: a.computed_broadcast_status,
		user_entry: a.user_entry ?? null,
	};
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const isAdmin = user ? await isAdminUser(supabase, user.id) : false;
	const filters = parseAnimeListFilters(url.searchParams);
	const {
		tab,
		search,
		genre,
		genres,
		season,
		broadcastYear,
		broadcastSeason,
		broadcastSeasons,
		studio,
		producer,
		source,
	} = filters;

	// ── ページネーション ─────────────────────────────────────────
	// 従来は最大1000件を毎回SSRペイロードに載せていた（P1）。1ページ分だけ返す。
	const PAGE_SIZE = 50;
	const pageParam = Number(url.searchParams.get("page") ?? "1");
	const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
	const offset = (page - 1) * PAGE_SIZE;
	const userId = user?.id ?? null;

	/** ランキングビュー系タブ：件数0なら通常一覧にフォールバック（既存挙動を維持） */
	const rankingTab = async (
		kind: "popular" | "trending" | "top_rated",
		fetchPage: (limit: number, off: number) => Promise<Anime[]>,
	): Promise<AnimeListPageResult> => {
		const total = await countAnimeRanking(supabase, kind);
		if (total === 0) return getAnimeListPage(supabase, { page, pageSize: PAGE_SIZE, userId });
		return { items: await fetchPage(PAGE_SIZE, offset), total };
	};

	let result: AnimeListPageResult;

	if (filters.hasSearchFilters) {
		result =
			tab === "mylist" && !user
				? { items: [], total: 0 }
				: await getAnimeListPage(supabase, {
						...buildAnimeListOptions(filters, userId),
						page,
						pageSize: PAGE_SIZE,
					});
	} else if (tab === "mylist") {
		result = user
			? {
					items: await getUserAnimeList(supabase, user.id, undefined, { limit: PAGE_SIZE, offset }),
					total: await countUserAnimeList(supabase, user.id),
				}
			: { items: [], total: 0 };
	} else if (tab === "trending") {
		result = await rankingTab("trending", (limit, off) => getAnimeRankingTrending(supabase, limit, off));
	} else if (tab === "top_rated") {
		result = await rankingTab("top_rated", (limit, off) => getAnimeRankingTopRated(supabase, limit, off));
	} else if (tab === "airing") {
		result = await getAnimeListPage(supabase, { broadcastStatus: "airing", userId, page, pageSize: PAGE_SIZE });
	} else if (tab === "upcoming") {
		result = await getAnimeListPage(supabase, { broadcastStatus: "upcoming", userId, page, pageSize: PAGE_SIZE });
	} else if (tab === "all") {
		result = await getAnimeListPage(supabase, { userId, page, pageSize: PAGE_SIZE });
	} else if (tab === "register") {
		result = { items: [], total: 0 };
	} else {
		result = await rankingTab("popular", (limit, off) => getAnimeRankingPopularity(supabase, limit, off));
	}

	return {
		animes: result.items.map(toAnimeListItem),
		total: result.total,
		page,
		pageSize: PAGE_SIZE,
		tab,
		search,
		genre,
		genres,
		season,
		broadcastYear,
		broadcastSeason,
		broadcastSeasons,
		studio,
		producer,
		source,
		user,
		isAdmin,
	};
};

export const actions: Actions = {
	upsertWatchlist: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		const { upsertUserAnimeEntry } = await import("$lib/server/actions");
		return upsertUserAnimeEntry(supabase, request, user.id);
	},

	registerAnime: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });
		return registerAnimeAction(supabase, request);
	},
};
