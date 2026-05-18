import { error, json } from "@sveltejs/kit";
import { insertPostWithHashtags } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const form = await request.formData();
	const content = (form.get("content") as string | null)?.trim() ?? "";
	const parentId = (form.get("parent_id") as string | null)?.trim() || null;
	const animeId = (form.get("anime_id") as string | null)?.trim() || null;
	const quotePostId = (form.get("quote_post_id") as string | null)?.trim() || null;

	if (!content) error(400, "コメントを入力してください");

	const result = await insertPostWithHashtags(supabase, user.id, content, parentId, [], animeId, quotePostId);

	if ("status" in result) {
		// fail() response — extract message
		const data = result.data as { message?: string } | undefined;
		error(result.status, data?.message ?? "投稿に失敗しました");
	}

	return json({ success: true, postId: result.postId });
};
