import { json } from "@sveltejs/kit";
import { getRoomPostsAfter, type RoomRef, type TimelineCursor } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^[\d\-T:.+Z]{10,40}$/;
/** 1回の応答で返す最大件数。続きがあれば hasMore で知らせ、クライアントが続けて取る */
const PAGE_SIZE = 100;
/** 旧クライアントの since（created_at より後）を、同じ意味のカーソルに置き換えるための最大の ID */
const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/**
 * ルームの投稿差分取得（ライブ更新用）。
 * session_id（放送ルーム）または event_id（イベントルーム）のいずれか一方を指定する。
 *
 * after_created_at と after_id（取得済みの境界）より後ろの投稿を古い順に最大 PAGE_SIZE 件返す。
 * 応答の nextCursor を次の境界にし、hasMore が true の間は続けて取る（#320）。
 * 旧クライアント向けに since（created_at より後）も受け付ける。
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
	const eventId = url.searchParams.get("event_id")?.trim() ?? "";

	if (!sessionId && !eventId) {
		return json({ message: "session_id または event_id が必要です" }, { status: 400 });
	}
	if (sessionId && !UUID_RE.test(sessionId)) return json({ message: "session_id が不正です" }, { status: 400 });
	if (eventId && !UUID_RE.test(eventId)) return json({ message: "event_id が不正です" }, { status: 400 });

	const afterCreatedAt = url.searchParams.get("after_created_at")?.trim() ?? "";
	const afterId = url.searchParams.get("after_id")?.trim() ?? "";
	const since = url.searchParams.get("since")?.trim() ?? "";

	let cursor: TimelineCursor | null = null;
	if (afterCreatedAt || afterId) {
		if (!TIMESTAMP_RE.test(afterCreatedAt) || !UUID_RE.test(afterId)) {
			return json({ message: "after_created_at / after_id が不正です" }, { status: 400 });
		}
		cursor = { createdAt: afterCreatedAt, id: afterId };
	} else if (since) {
		if (!TIMESTAMP_RE.test(since)) return json({ message: "since が不正です" }, { status: 400 });
		cursor = { createdAt: since, id: MAX_UUID };
	}

	const { user } = await safeGetSession();
	const room: RoomRef = eventId ? { kind: "event", id: eventId } : { kind: "broadcast", id: sessionId };
	const page = await getRoomPostsAfter(supabase, room, user?.id ?? null, cursor, PAGE_SIZE);
	if (!page) return json({ message: "投稿の取得に失敗しました" }, { status: 500 });

	return json(page);
};
