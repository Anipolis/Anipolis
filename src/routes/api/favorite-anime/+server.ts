import { error, json } from "@sveltejs/kit";
import { MAX_FAVORITE_ANIME } from "$lib/favorite-anime";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

// ベスト作品を、送られた順番で丸ごと置き換える（#361）
export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	await requireAccountCanWrite(supabase, user.id);

	const body = (await request.json().catch(() => null)) as { animeIds?: unknown } | null;
	const animeIds = body?.animeIds;
	if (
		!Array.isArray(animeIds) ||
		!animeIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
		new Set(animeIds).size !== animeIds.length
	) {
		error(400, "作品の指定が正しくありません");
	}
	if (animeIds.length > MAX_FAVORITE_ANIME) error(400, `ベスト作品は${MAX_FAVORITE_ANIME}作品までです`);

	const { error: rpcError } = await supabase.rpc("set_favorite_anime", { p_anime_ids: animeIds as number[] });
	if (rpcError) {
		console.error("set_favorite_anime error:", rpcError);
		// 選んだあとで作品が非公開になったときなど（DB が読めない作品を断る）
		if (rpcError.code === "22023") error(400, "選べない作品が含まれています。選び直してください");
		error(500, "ベスト作品の保存に失敗しました");
	}
	return json({ success: true });
};
