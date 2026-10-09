import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { buildIlikeContainsPattern, MAX_ACCOUNT_QUERY_LENGTH, normalizeAccountQuery } from "$lib/utils/search";

export async function GET({ url, locals: { supabase } }: RequestEvent) {
	// "@name" で打っても username で当たるように先頭の @ を外す。
	// % や _ はワイルドカードとして解釈させず、長すぎる入力は受け付けない（GitLab #33）。
	const query = normalizeAccountQuery(url.searchParams.get("q")).slice(0, MAX_ACCOUNT_QUERY_LENGTH);
	if (query.length < 1) return json([]);

	const { data } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url")
		.ilike("username", buildIlikeContainsPattern(query))
		.order("username", { ascending: true })
		.limit(10);

	return json(data ?? []);
}
