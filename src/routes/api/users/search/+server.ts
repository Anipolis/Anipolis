import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

export async function GET({ url, locals: { supabase } }: RequestEvent) {
	const query = url.searchParams.get("q")?.trim() ?? "";
	if (query.length < 1) return json([]);

	const { data } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url")
		.ilike("username", `%${query}%`)
		.order("username", { ascending: true })
		.limit(10);

	return json(data ?? []);
}
