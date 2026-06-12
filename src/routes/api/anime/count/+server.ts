import { json } from "@sveltejs/kit";
import { getAnimeCount } from "$lib/server/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	try {
		const genre = url.searchParams.get("genre")?.trim() ?? "";
		const broadcastYearParam = url.searchParams.get("broadcastYear")?.trim() ?? "";
		const broadcastYear = /^\d{4}$/.test(broadcastYearParam) ? broadcastYearParam : "";
		const broadcastSeason = url.searchParams.get("broadcastSeason")?.trim() ?? "";
		const studio = url.searchParams.get("studio")?.trim() ?? "";
		const producer = url.searchParams.get("producer")?.trim() ?? "";
		const search = url.searchParams.get("search")?.trim() ?? "";

		const opts: Parameters<typeof getAnimeCount>[1] = {};
		if (genre) opts.genre = genre;
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
