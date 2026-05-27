import { json, type RequestHandler } from "@sveltejs/kit";
import { getPostReactionUsers } from "$lib/server/queries";
import type { ReactionType } from "$lib/types";

export const GET: RequestHandler = async ({ params, url, locals: { supabase } }) => {
	const postId = params.id;
	if (!postId) {
		return json({ message: "投稿が見つかりません" }, { status: 404 });
	}

	const type = url.searchParams.get("type");
	if (type !== "like" && type !== "repost") {
		return json({ message: "リアクション種別が不正です" }, { status: 400 });
	}

	try {
		const users = await getPostReactionUsers(supabase, postId, type as ReactionType);
		return json({ users });
	} catch {
		return json({ message: "リアクションしたユーザーの取得に失敗しました" }, { status: 500 });
	}
};
