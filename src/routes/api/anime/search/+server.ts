import { json } from "@sveltejs/kit";
import { buildTitleSearchFilter } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const query = url.searchParams.get("q")?.trim() ?? "";
	if (query.length < 1) return json([]);
	// order=recent は放送時期の新しい順（投稿欄のルーム選び）。既定は作品名順
	const recent = url.searchParams.get("order") === "recent";

	let request = supabase
		.from("anime")
		.select("id, title, title_en, cover_url, official_hashtag, type, aired_from")
		.or(buildTitleSearchFilter(query));
	if (recent) request = request.order("aired_from", { ascending: false, nullsFirst: false });
	const { data } = await request.order("title", { ascending: true }).limit(10);

	return json(data ?? [], {
		headers: {
			"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
		},
	});
};
