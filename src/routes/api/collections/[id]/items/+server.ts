import { error, json } from "@sveltejs/kit";
import { isCollectionId, MAX_COLLECTION_ITEMS, MAX_COLLECTION_TIERS } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

// コレクションの作品を、送られた順番で丸ごと置き換える（#515）。
// ティア表の並べ替えは tiers（animeIds と同じ長さ。段の番号か null）も送る。送らなければ今の段を引き継ぐ（192）
export const PUT: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
	await requireAccountCanWrite(supabase, user.id);

	const body = (await request.json().catch(() => null)) as { animeIds?: unknown; tiers?: unknown } | null;
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

	const tiers = body?.tiers;
	if (
		tiers !== undefined &&
		(!Array.isArray(tiers) ||
			tiers.length !== animeIds.length ||
			!tiers.every(
				(tier) => tier === null || (Number.isInteger(tier) && tier >= 0 && tier < MAX_COLLECTION_TIERS),
			))
	) {
		error(400, "段の指定が正しくありません");
	}

	const { error: rpcError } = await supabase.rpc("set_collection_items", {
		p_collection_id: params.id,
		p_anime_ids: animeIds as number[],
		...(tiers !== undefined ? { p_tiers: tiers as (number | null)[] } : {}),
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
