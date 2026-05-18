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

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const tab = (url.searchParams.get("tab") as Tab) ?? "popular";
	const search = url.searchParams.get("search")?.trim() ?? "";
	const genre = url.searchParams.get("genre")?.trim() ?? "";
	const season = url.searchParams.get("season")?.trim() ?? "";
	const studio = url.searchParams.get("studio")?.trim() ?? "";
	const producer = url.searchParams.get("producer")?.trim() ?? "";

	let animes: Anime[];

	if (search) {
		animes = await getAnimeList(supabase, { query: search, limit: 1000, userId: user?.id ?? null });
	} else if (genre) {
		animes = await getAnimeList(supabase, { genre, limit: 1000, userId: user?.id ?? null });
	} else if (season) {
		animes = await getAnimeList(supabase, { season, limit: 1000, userId: user?.id ?? null });
	} else if (studio) {
		animes = await getAnimeList(supabase, { studio, limit: 1000, userId: user?.id ?? null });
	} else if (producer) {
		animes = await getAnimeList(supabase, { producer, limit: 1000, userId: user?.id ?? null });
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
		animes = await getAnimeList(supabase, { status: "airing", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "upcoming") {
		animes = await getAnimeList(supabase, { status: "upcoming", limit: 1000, userId: user?.id ?? null });
	} else if (tab === "register") {
		animes = [];
	} else {
		animes = await getAnimeRankingPopularity(supabase, 1000);
		if (animes.length === 0) {
			animes = await getAnimeList(supabase, { limit: 1000, userId: user?.id ?? null });
		}
	}

	return { animes, tab, search, genre, season, studio, producer, user };
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

		const form = await request.formData();
		const title = (form.get("title") as string)?.trim();
		if (!title) return fail(400, { message: "タイトルは必須です" });

		const toArr = (vals: FormDataEntryValue[]) => vals.map((val) => (val as string).trim()).filter(Boolean);

		const episodeCountRaw = form.get("episode_count") as string;

		let coverUrl: string | null = (form.get("cover_url") as string)?.trim() || null;
		const imageFile = form.get("image_file");
		if (imageFile instanceof File && imageFile.size > 0) {
			const ext = imageFile.type === "image/webp" ? "webp" : "jpg";
			const path = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
			const arrayBuffer = await imageFile.arrayBuffer();
			const { error: uploadError } = await supabase.storage
				.from("anime-covers")
				.upload(path, arrayBuffer, { contentType: imageFile.type, upsert: false });
			if (!uploadError) {
				coverUrl = supabase.storage.from("anime-covers").getPublicUrl(path).data.publicUrl;
			}
		}

		const { data, error } = await supabase
			.from("anime")
			.insert({
				title,
				title_en: (form.get("title_en") as string)?.trim() || null,
				title_romaji: (form.get("title_romaji") as string)?.trim() || null,
				synopsis: (form.get("synopsis") as string)?.trim() || null,
				cover_url: coverUrl,
				season: (form.get("season") as string)?.trim() || null,
				episode_count: episodeCountRaw ? parseInt(episodeCountRaw, 10) : null,
				type: (form.get("type") as string)?.trim() || null,
				status: (form.get("status") as string)?.trim() || null,
				aired_from: (form.get("aired_from") as string)?.trim() || null,
				aired_to: (form.get("aired_to") as string)?.trim() || null,
				source: (form.get("source") as string)?.trim() || null,
				genre: toArr(form.getAll("genre")),
				studio: toArr(form.getAll("studio")),
				producer: toArr(form.getAll("producer")),
				official_hashtag: toArr(form.getAll("official_hashtag")),
				official_site_url: (form.get("official_site_url") as string)?.trim() || null,
				official_x_url: (form.get("official_x_url") as string)?.trim() || null,
				copyright: (form.get("copyright") as string)?.trim() || null,
			})
			.select("id")
			.single();

		if (error) return fail(500, { message: `登録エラー: ${error.message}` });
		return { success: true, animeId: String((data as { id: number }).id) };
	},
};
