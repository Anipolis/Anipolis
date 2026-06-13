import { json } from "@sveltejs/kit";
import { getAnimeCount } from "$lib/server/queries.js";
import type { RequestHandler } from "./$types";

function parseGenres(value: string | null): string[] {
	return [
		...new Set(
			(value ?? "")
				.split(",")
				.map((genre) => genre.trim())
				.filter(Boolean),
		),
	];
}

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	try {
		const genres = parseGenres(url.searchParams.get("genres") ?? url.searchParams.get("genre"));
		const broadcastYearParam =
			(url.searchParams.get("year") ?? url.searchParams.get("broadcastYear"))?.trim() ?? "";
		const broadcastYear = /^\d{4}$/.test(broadcastYearParam) ? broadcastYearParam : "";
		const broadcastSeason =
			(url.searchParams.get("season") ?? url.searchParams.get("broadcastSeason"))?.trim() ?? "";
		const studio = url.searchParams.get("studio")?.trim() ?? "";
		const producer = url.searchParams.get("producer")?.trim() ?? "";
		const search = url.searchParams.get("search")?.trim() ?? "";

		const opts: Parameters<typeof getAnimeCount>[1] = {};
		if (genres.length) opts.genres = genres;
		if (broadcastYear) opts.broadcastYear = broadcastYear;
		if (broadcastSeason) opts.broadcastSeason = broadcastSeason;
		if (studio) opts.studio = studio;
		if (producer) opts.producer = producer;
		if (search) opts.query = search;
		const count = await getAnimeCount(supabase, opts);

		return json({ count });
	} catch {
		return json({ count: 0 });
	}
};
