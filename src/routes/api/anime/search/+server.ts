import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const query = url.searchParams.get("q")?.trim() ?? "";
	if (query.length < 1) return json([]);

	// PostgREST の .or() フィルター文字列にカンマを含む入力を補間すると
	// フィルター構文が破壊されるためサニタイズする
	const sanitizedQuery = query.replace(/[%,]/g, "");

	const { data } = await supabase
		.from("anime")
		.select("id, title, title_en, cover_url")
		.or(`title.ilike.%${sanitizedQuery}%,title_en.ilike.%${sanitizedQuery}%`)
		.order("title", { ascending: true })
		.limit(10);

	return json(data ?? []);
};
