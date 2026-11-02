import { error, json } from "@sveltejs/kit";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestEvent, RequestHandler } from "./$types";

const ACTIVITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * アクティビティ（181）のいいねを付ける（POST）・外す（DELETE）。
 * 付けられるのは自分に見えている記録だけ（RLS）。応答には保存後のいいね数を返す
 */
async function updateLike(event: RequestEvent, liked: boolean) {
	const {
		params,
		locals: { supabase, safeGetSession },
	} = event;
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!ACTIVITY_ID_PATTERN.test(params.id)) error(404, "アクティビティが見つかりません");
	await requireAccountCanWrite(supabase, user.id);

	if (liked) {
		const { error: insertError } = await supabase
			.from("mylist_activity_likes")
			.insert({ activity_id: params.id, user_id: user.id });
		// 23505: もう付いている（別のタブで押した等）。付いている状態を返せばよい
		if (insertError && insertError.code !== "23505") {
			// RLS で断られた = 見えない（消えた・非公開になった）記録
			if (insertError.code === "42501") error(404, "アクティビティが見つかりません");
			console.error("activity like insert error:", insertError);
			error(500, "いいねできませんでした");
		}
	} else {
		const { error: deleteError } = await supabase
			.from("mylist_activity_likes")
			.delete()
			.eq("activity_id", params.id)
			.eq("user_id", user.id);
		if (deleteError) {
			console.error("activity like delete error:", deleteError);
			error(500, "いいねを外せませんでした");
		}
	}

	const { count, error: countError } = await supabase
		.from("mylist_activity_likes")
		.select("activity_id", { count: "exact", head: true })
		.eq("activity_id", params.id);
	if (countError) console.error("activity like count error:", countError);
	return json({ liked, likeCount: count ?? null });
}

export const POST: RequestHandler = (event) => updateLike(event, true);
export const DELETE: RequestHandler = (event) => updateLike(event, false);
