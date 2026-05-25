import { fail } from "@sveltejs/kit";
import {
	getAnimeList,
	getAnimeRankingPopularity,
	getAnimeRankingTopRated,
	getAnimeRankingTrending,
	getUserAnimeList,
} from "$lib/server/queries";
import type { Anime } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

type Tab = "popular" | "trending" | "top_rated" | "mylist" | "airing" | "upcoming" | "register";

function normalizeBroadcastTime(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
	if (!match) return undefined;

	const hour = Number(match[1]);
	if (!Number.isInteger(hour) || hour < 0 || hour > 47) return undefined;

	return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function normalizeEpisodeCount(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return null;

	const episodeCount = Number(raw);
	if (!Number.isInteger(episodeCount) || episodeCount < 1) return undefined;

	return raw;
}

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const tab = (url.searchParams.get("tab") as Tab) ?? "popular";
	const search = url.searchParams.get("search")?.trim() ?? "";
	const genre = url.searchParams.get("genre")?.trim() ?? "";
	const season = url.searchParams.get("season")?.trim() ?? "";
	const broadcastYearParam = url.searchParams.get("broadcastYear")?.trim() ?? "";
	const broadcastYear = /^\d{4}$/.test(broadcastYearParam) ? broadcastYearParam : "";
	const broadcastSeason = url.searchParams.get("broadcastSeason")?.trim() ?? "";
	const studio = url.searchParams.get("studio")?.trim() ?? "";
	const producer = url.searchParams.get("producer")?.trim() ?? "";

	let animes: Anime[];
	const hasSearchFilters = Boolean(
		search || genre || season || broadcastYear || broadcastSeason || studio || producer,
	);

	if (hasSearchFilters) {
		const filters: NonNullable<Parameters<typeof getAnimeList>[1]> = {
			limit: 1000,
			userId: user?.id ?? null,
		};
		if (search) filters.query = search;
		if (genre) filters.genre = genre;
		if (season) filters.season = season;
		if (broadcastYear) filters.broadcastYear = broadcastYear;
		if (broadcastSeason) filters.broadcastSeason = broadcastSeason;
		if (studio) filters.studio = studio;
		if (producer) filters.producer = producer;
		animes = await getAnimeList(supabase, filters);
	} else if (tab === "mylist") {
		animes = user ? await getUserAnimeList(supabase, user.id) : [];
	} else if (tab === "trending") {
		animes = await getAnimeRankingTrending(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	} else if (tab === "top_rated") {
		animes = await getAnimeRankingTopRated(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	} else if (tab === "airing") {
		animes = await getAnimeList(supabase, { broadcastStatus: "airing", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "upcoming") {
		animes = await getAnimeList(supabase, { broadcastStatus: "upcoming", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "register") {
		animes = [];
	} else {
		animes = await getAnimeRankingPopularity(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	}

	return { animes, tab, search, genre, season, broadcastYear, broadcastSeason, studio, producer, user };
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

		const fd = await request.formData();
		const title = (fd.get("title") as string)?.trim();
		if (!title) return fail(400, { message: "タイトルは必須です" });

		const toArr = (vals: FormDataEntryValue[]) => vals.map((v) => (v as string).trim()).filter(Boolean);

		const episodeCount = normalizeEpisodeCount(fd.get("episode_count") as string | null);
		if (episodeCount === undefined) {
			return fail(400, { message: "話数は1以上の整数で入力してください" });
		}

		const broadcastTime = normalizeBroadcastTime(fd.get("broadcast_time") as string | null);
		if (broadcastTime === undefined) {
			return fail(400, { message: "放送時刻は 23:30 や 26:00 の形式で入力してください" });
		}

		let cover_url: string | null = (fd.get("cover_url") as string)?.trim() || null;
		const imageFile = fd.get("image_file");
		if (imageFile instanceof File && imageFile.size > 0) {
			const ext = imageFile.type === "image/webp" ? "webp" : "jpg";
			const path = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
			const arrayBuffer = await imageFile.arrayBuffer();
			const { error: uploadError } = await supabase.storage
				.from("anime-covers")
				.upload(path, arrayBuffer, { contentType: imageFile.type, upsert: false });
			if (!uploadError) {
				cover_url = supabase.storage.from("anime-covers").getPublicUrl(path).data.publicUrl;
			}
		}

		const { data, error } = await supabase
			.from("anime")
			.insert({
				title,
				title_en: (fd.get("title_en") as string)?.trim() || null,
				title_romaji: (fd.get("title_romaji") as string)?.trim() || null,
				synopsis: (fd.get("synopsis") as string)?.trim() || null,
				cover_url,
				season: (fd.get("season") as string)?.trim() || null,
				episode_count: episodeCount,
				type: (fd.get("type") as string)?.trim() || null,
				aired_from: (fd.get("aired_from") as string)?.trim() || null,
				aired_to: (fd.get("aired_to") as string)?.trim() || null,
				source: (fd.get("source") as string)?.trim() || null,
				genre: toArr(fd.getAll("genre")),
				studio: toArr(fd.getAll("studio")),
				producer: toArr(fd.getAll("producer")),
				official_hashtag: toArr(fd.getAll("official_hashtag")),
				official_site_url: (fd.get("official_site_url") as string)?.trim() || null,
				official_x_url: (fd.get("official_x_url") as string)?.trim() || null,
				copyright: (fd.get("copyright") as string)?.trim() || null,
				broadcast_day: (() => {
					const v = (fd.get("broadcast_day") as string)?.trim();
					return v !== "" && v != null ? parseInt(v, 10) : null;
				})(),
				broadcast_time: broadcastTime,
				broadcast_station: (() => {
					const v = (fd.get("broadcast_station") as string)?.trim();
					if (!v) return null;
					const arr = v
						.split(/[,、]/)
						.map((s) => s.trim())
						.filter(Boolean);
					return arr.length ? arr : null;
				})(),
			})
			.select("id")
			.single();

		if (error) return fail(500, { message: `登録エラー: ${error.message}` });
		return { success: true, animeId: String((data as { id: number }).id) };
	},
};
