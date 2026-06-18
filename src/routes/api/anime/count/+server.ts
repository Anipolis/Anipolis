import { json } from "@sveltejs/kit";
import { buildAnimeCountOptions, parseAnimeListFilters } from "$lib/server/anime-list-filters.js";
import { getAnimeCount } from "$lib/server/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	try {
		const filters = parseAnimeListFilters(url.searchParams);
		const count = await getAnimeCount(supabase, buildAnimeCountOptions(filters));

		return json({ count });
	} catch {
		return json({ count: 0 });
	}
};
