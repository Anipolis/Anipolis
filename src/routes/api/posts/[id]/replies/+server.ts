import type { SupabaseClient } from "@supabase/supabase-js";
import { json, type RequestHandler } from "@sveltejs/kit";
import { buildPostCardSelect } from "$lib/server/post-selects";
import { enrichPostsWithCounts } from "$lib/server/queries";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";

const POSTS_SELECT = buildPostCardSelect();

function parseLimit(value: string | null, fallback: number, max: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export const GET: RequestHandler = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	if (!params.id) return json({ message: "投稿が見つかりません" }, { status: 404 });

	const mode = url.searchParams.get("mode") === "all" ? "all" : "recent";
	const limit = parseLimit(url.searchParams.get("limit"), mode === "all" ? 100 : 3, 100);
	const { user } = await safeGetSession();
	const postReader = supabase as SupabaseClient<Database>;

	let query = postReader.from("posts").select(POSTS_SELECT).eq("parent_id", params.id);
	if (mode === "recent") {
		query = query.order("created_at", { ascending: false }).limit(limit);
	} else {
		query = query.order("created_at", { ascending: true }).limit(limit);
	}

	const { data, error } = await query;
	if (error) return json({ message: "返信の取得に失敗しました" }, { status: 500 });

	const ordered = mode === "recent" ? [...(data ?? [])].reverse() : (data ?? []);
	const replies = await enrichPostsWithCounts(supabase, ordered as unknown as RawPost[], user?.id ?? null, {
		includeMutedRoomPosts: true,
	});

	return json({ replies });
};
