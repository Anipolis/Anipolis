import { error, json } from "@sveltejs/kit";
import { isCollectionId, MAX_COLLECTION_ITEMS } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

// コレクションの作品を、送られた順番で丸ごと置き換える（#515）
export const PUT: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
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
	if (animeIds.length > MAX_COLLECTION_ITEMS)
		error(400, `コレクションには${MAX_COLLECTION_ITEMS}作品まで入れられます`);

	const { error: rpcError } = await supabase.rpc("set_collection_items", {
		p_collection_id: params.id,
		p_anime_ids: animeIds as number[],
	});
	if (rpcError) {
		console.error("set_collection_items error:", rpcError);
		// 自分のものでない・消された
		if (rpcError.code === "P0002") error(404, "コレクションが見つかりません");
		// 選んだあとで作品が非公開になったときなど（DB が読めない作品を断る）
		if (rpcError.code === "22023") error(400, "選べない作品が含まれています。選び直してください");
		error(500, "コレクションの保存に失敗しました");
	}
	return json({ success: true });
};
