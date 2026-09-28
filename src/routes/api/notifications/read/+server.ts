import { error, json } from "@sveltejs/kit";
import { markCategoryNotificationsRead } from "$lib/server/actions";
import { parseNotificationCategory } from "$lib/server/notification-category";
import type { RequestHandler } from "./$types";

/**
 * 表示中カテゴリの通知を既読にする。
 * server load に置くと hover プリロードやブラウザの先読みで load が走っただけで
 * 未読が消えるため（#242）、ページが実際に描画された後にクライアントから明示的に呼ぶ。
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	let body: unknown = null;
	try {
		body = await request.json();
	} catch {
		error(400, "リクエスト本文が不正です");
	}
	const category = parseNotificationCategory((body as { category?: unknown } | null)?.category);
	if (!category) error(400, "通知カテゴリが不正です");

	const { error: updateError } = await markCategoryNotificationsRead(supabase, user.id, category);
	if (updateError) error(500, "既読の更新に失敗しました");

	return json({ success: true, category });
};
