import { json, type RequestHandler } from "@sveltejs/kit";
import { enrichPostsWithCounts, getPostReplies, getPostRepliesAfter, type TimelineCursor } from "$lib/server/queries";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^[\d\-T:.+Z]{10,40}$/;

function parseLimit(value: string | null, fallback: number, max: number) {
	if (value == null || value.trim() === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(1, Math.floor(parsed)));
}

/**
 * 投稿の返信を返す。
 * - mode=recent: 新しい limit 件（古い順に並べて返す）
 * - mode=all: 古い順に、after_created_at / after_id（取得済みの境界）より後ろから limit 件。
 *   nextCursor と hasMore を返すので、続きがあれば続けて取れる（#325）
 */
export const GET: RequestHandler = async ({ params, url, locals: { supabase, safeGetSession } }) => {
	if (!params.id) return json({ message: "投稿が見つかりません" }, { status: 404 });
	if (!UUID_PATTERN.test(params.id)) return json({ message: "投稿が見つかりません" }, { status: 404 });

	const mode = url.searchParams.get("mode") === "all" ? "all" : "recent";
	const limit = parseLimit(url.searchParams.get("limit"), mode === "all" ? 100 : 3, 100);
	const { user } = await safeGetSession();

	if (mode === "recent") {
		const rows = await getPostReplies(supabase, params.id, { mode, limit }).catch((error) => {
			console.error("post replies query failed:", error);
			return null;
		});
		if (!rows) return json({ message: "返信の取得に失敗しました" }, { status: 500 });
		const replies = await enrichPostsWithCounts(supabase, rows, user?.id ?? null, { includeMutedRoomPosts: true });
		return json({ replies });
	}

	const afterCreatedAt = url.searchParams.get("after_created_at")?.trim() ?? "";
	const afterId = url.searchParams.get("after_id")?.trim() ?? "";
	let cursor: TimelineCursor | null = null;
	if (afterCreatedAt || afterId) {
		if (!TIMESTAMP_PATTERN.test(afterCreatedAt) || !ANY_UUID_PATTERN.test(afterId)) {
			return json({ message: "after_created_at / after_id が不正です" }, { status: 400 });
		}
		cursor = { createdAt: afterCreatedAt, id: afterId };
	}

	const page = await getPostRepliesAfter(supabase, params.id, cursor, limit).catch((error) => {
		console.error("post replies query failed:", error);
		return null;
	});
	if (!page) return json({ message: "返信の取得に失敗しました" }, { status: 500 });

	const replies = await enrichPostsWithCounts(supabase, page.rows, user?.id ?? null, {
		includeMutedRoomPosts: true,
	});
	return json({ replies, nextCursor: page.nextCursor, hasMore: page.hasMore });
};
