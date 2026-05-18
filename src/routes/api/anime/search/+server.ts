import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const q = url.searchParams.get("q")?.trim() ?? "";
	if (q.length < 1) return json([]);

	// PostgREST の .or() フィルター文字列にカンマを含む入力を補間すると
	// フィルター構文が破壊されるためサニタイズする
	const safeQ = q.replace(/[%,]/g, "");

	const { data } = await supabase
		.from("anime")
		.select("id, title, title_en, cover_url")
		.or(`title.ilike.%${safeQ}%,title_en.ilike.%${safeQ}%`)
		.order("title", { ascending: true })
		.limit(10);

	return json(data ?? []);
};
