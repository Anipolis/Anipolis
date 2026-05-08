import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

export async function GET({ url, locals: { supabase } }: RequestEvent) {
	const q = url.searchParams.get("q")?.trim() ?? "";
	if (q.length < 1) return json([]);

	const { data } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url")
		.ilike("username", `%${q}%`)
		.order("username", { ascending: true })
		.limit(10);

	return json(data ?? []);
}
