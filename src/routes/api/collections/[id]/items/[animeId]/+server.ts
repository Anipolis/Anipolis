import { error, json } from "@sveltejs/kit";
import { isCollectionId, MAX_COLLECTION_ITEMS, withAnimeAdded, withAnimeRemoved } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import type { RequestEvent, RequestHandler } from "./$types";

/**
 * 作品ページの「コレクションに追加」から、1作品だけを足す（POST）・外す（DELETE）（#515）。
 * 今の並びを読んで1作品を足し引きし、set_collection_items で丸ごと置き換える。
 * 同じ人が別の画面で同時に並びを保存すると後の保存が勝つが、コレクションの編集画面と同じ扱いにする。
 * 後から非表示になった作品は読めず、残すと set_collection_items が全体を断るので、並びから外して保存する
 * （編集画面も読めない作品を除いて保存するのと同じ）
 */
async function updateMembership(event: RequestEvent, mode: "add" | "remove") {
	const {
		params,
		locals: { supabase, safeGetSession },
	} = event;
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!isCollectionId(params.id)) error(404, "コレクションが見つかりません");
	const animeId = Number(params.animeId);
	if (!Number.isSafeInteger(animeId) || animeId <= 0) error(400, "作品の指定が正しくありません");
	await requireAccountCanWrite(supabase, user.id);

	const { data: collection, error: readError } = await supabase
		.from("user_collections")
		.select("id, items:user_collection_items(anime_id, position, anime:anime_id(id))")
		.eq("id", params.id)
		.eq("user_id", user.id)
		.order("position", { referencedTable: "items" })
		.maybeSingle();
	if (readError) {
		console.error("collection read error:", readError);
		error(500, "コレクションの保存に失敗しました");
	}
	if (!collection) error(404, "コレクションが見つかりません");

	const current = collection.items.filter((item) => item.anime !== null).map((item) => Number(item.anime_id));
	const next = mode === "add" ? withAnimeAdded(current, animeId) : withAnimeRemoved(current, animeId);
	if (next.length === current.length) return json({ success: true, itemCount: current.length });
	if (next.length > MAX_COLLECTION_ITEMS) error(400, `コレクションには${MAX_COLLECTION_ITEMS}作品まで入れられます`);

	const { error: rpcError } = await supabase.rpc("set_collection_items", {
		p_collection_id: params.id,
		p_anime_ids: next,
	});
	if (rpcError) {
		console.error("set_collection_items error:", rpcError);
		if (rpcError.code === "P0002") error(404, "コレクションが見つかりません");
		if (rpcError.code === "22023") error(400, "この作品はコレクションに入れられません");
		error(500, "コレクションの保存に失敗しました");
	}
	return json({ success: true, itemCount: next.length });
}

export const POST: RequestHandler = (event) => updateMembership(event, "add");
export const DELETE: RequestHandler = (event) => updateMembership(event, "remove");
