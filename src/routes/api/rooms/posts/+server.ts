import { json } from "@sveltejs/kit";
import { getBroadcastRoomPosts, getEventRoomPosts } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^[\d\-T:.+Z]{10,40}$/;

/**
 * ルームの投稿差分取得（ライブ更新用）。
 * session_id（放送ルーム）または event_id（イベントルーム）のいずれか一方を指定する。
 * since（最後に受信した投稿の created_at）以降の投稿を昇順で返す。
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
	const eventId = url.searchParams.get("event_id")?.trim() ?? "";

	if (!sessionId && !eventId) {
		return json({ message: "session_id または event_id が必要です" }, { status: 400 });
	}
	if (sessionId && !UUID_RE.test(sessionId)) return json({ message: "session_id が不正です" }, { status: 400 });
	if (eventId && !UUID_RE.test(eventId)) return json({ message: "event_id が不正です" }, { status: 400 });

	const since = url.searchParams.get("since")?.trim() ?? "";
	if (since && !TIMESTAMP_RE.test(since)) return json({ message: "since が不正です" }, { status: 400 });

	const { user } = await safeGetSession();

	const posts = eventId
		? await getEventRoomPosts(supabase, eventId, user?.id ?? null, {
				limit: 100,
				ascending: true,
				...(since ? { sinceCreatedAt: since } : {}),
			})
		: await getBroadcastRoomPosts(supabase, sessionId, user?.id ?? null, {
				limit: 100,
				ascending: true,
				...(since ? { sinceCreatedAt: since } : {}),
			});

	return json({ posts });
};
