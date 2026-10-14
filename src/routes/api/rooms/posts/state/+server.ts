import { json } from "@sveltejs/kit";
import { getVisiblePostReplyCounts } from "$lib/server/queries";
import { ROOM_STATE_MAX_IDS } from "$lib/utils/room-connection";
import type { RequestHandler } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 表示中のルーム投稿が今も閲覧できるかと、その返信数を返す（#324）。
 *
 * Realtime は INSERT しか購読しておらず、削除・管理者非表示で見えなくなった行は RLS で
 * 届かないこともあるため、ルームは定期的にこれで確かめ直す。
 * 読み取りだけだが投稿 ID の一覧を送るので、URL の長さを気にしなくてよい POST にする。
 */
export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
	const ids = Array.isArray(body?.ids) ? body.ids : null;
	if (!ids || ids.length > ROOM_STATE_MAX_IDS || !ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
		return json({ message: "ids が不正です" }, { status: 400 });
	}

	const counts = await getVisiblePostReplyCounts(supabase, ids as string[]);
	if (!counts) return json({ message: "投稿の状態を取得できませんでした" }, { status: 500 });

	// 結果に含まれない ID は、削除・非表示・ブロックで見えなくなった投稿
	return json({ visible: Object.fromEntries(counts) });
};
