import { error, json } from "@sveltejs/kit";
import { collectionTiersError, isCollectionId, MAX_COLLECTION_TIERS } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestHandler } from "./$types";

// ティア表の段の名前と並びを変える（詳細ページで段の名前を直す・段を足す・消す）。
// origins は新しい各段が元は何番目の段だったか（足した段は null）。作品の段の付け替えは DB の関数が一緒に行う（192）
export const PUT: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
	await requireAccountCanWrite(supabase, user.id);

	const body = (await request.json().catch(() => null)) as { tiers?: unknown; origins?: unknown } | null;
	const rawTiers = body?.tiers;
	const origins = body?.origins;
	if (!Array.isArray(rawTiers) || !rawTiers.every((label) => typeof label === "string")) {
		error(400, "段の指定が正しくありません");
	}
	const tiers = rawTiers.map((label: string) => label.trim());
	const tiersError = collectionTiersError(tiers);
	if (tiersError) error(400, tiersError);
	if (
		!Array.isArray(origins) ||
		origins.length !== tiers.length ||
		!origins.every(
			(origin) => origin === null || (Number.isInteger(origin) && origin >= 0 && origin < MAX_COLLECTION_TIERS),
		)
	) {
		error(400, "段の指定が正しくありません");
	}

	const { error: rpcError } = await supabase.rpc("set_collection_tiers", {
		p_collection_id: params.id,
		p_tiers: tiers,
		p_origins: origins as (number | null)[],
	});
	if (rpcError) {
		console.error("set_collection_tiers error:", rpcError);
		if (rpcError.code === "P0002") error(404, "コレクションが見つかりません");
		if (rpcError.code === "22023") error(400, "段の指定が正しくありません");
		error(500, "段の保存に失敗しました");
	}
	return json({ success: true });
};
