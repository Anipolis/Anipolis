import { json, type RequestHandler } from "@sveltejs/kit";
import { enrichPostsWithCounts, getPostReplies } from "$lib/server/queries";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLimit(value: string | null, fallback: number, max: number) {
	if (value == null || value.trim() === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export const GET: RequestHandler = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	if (!params.id) return json({ message: "投稿が見つかりません" }, { status: 404 });
	if (!UUID_PATTERN.test(params.id)) return json({ message: "投稿が見つかりません" }, { status: 404 });

	const mode = url.searchParams.get("mode") === "all" ? "all" : "recent";
	const limit = parseLimit(url.searchParams.get("limit"), mode === "all" ? 100 : 3, 100);
	const { user } = await safeGetSession();

	const rows = await getPostReplies(supabase, params.id, { mode, limit }).catch((error) => {
		console.error("post replies query failed:", error);
		return null;
	});
	if (!rows) return json({ message: "返信の取得に失敗しました" }, { status: 500 });

	const replies = await enrichPostsWithCounts(supabase, rows, user?.id ?? null, {
		includeMutedRoomPosts: true,
	});

	return json({ replies });
};
