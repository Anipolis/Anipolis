import { json } from "@sveltejs/kit";
import { buildTitleSearchFilter } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const query = url.searchParams.get("q")?.trim() ?? "";
	if (query.length < 1) return json([]);

	const { data } = await supabase
		.from("anime")
		.select("id, title, title_en, cover_url, official_hashtag")
		.or(buildTitleSearchFilter(query))
		.order("title", { ascending: true })
		.limit(10);

	return json(data ?? [], {
		headers: {
			"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
		},
	});
};
