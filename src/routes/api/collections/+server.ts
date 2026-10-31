import { error, json } from "@sveltejs/kit";
import { MAX_COLLECTIONS_PER_USER, parseCollectionInput } from "$lib/collections";
import { requireAccountCanWrite } from "$lib/server/actions";
import { getAnimeCoverUrl, getCollectionsForAnime } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

function parseAnimeId(value: unknown): number {
	const animeId = Number(value);
	if (!Number.isSafeInteger(animeId) || animeId <= 0) error(400, "作品の指定が正しくありません");
	return animeId;
}

// 作品ページの「コレクションに追加」: 自分のコレクションと、その作品が入っているか（#515）
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	const animeId = parseAnimeId(url.searchParams.get("anime"));
	const collections = await getCollectionsForAnime(supabase, user.id, animeId);
	return json({ collections, limit: MAX_COLLECTIONS_PER_USER });
};

// 作品ページから、コレクションを作ってその作品を入れる（題名だけ。公開設定と説明はコレクションのページで決める）
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	const form = await request.formData();
	const animeId = parseAnimeId(form.get("anime_id"));
	await requireAccountCanWrite(supabase, user.id);

	const parsed = parseCollectionInput(form);
	if (!parsed.ok) return json({ message: parsed.message }, { status: 400 });

	const { data, error: insertError } = await supabase
		.from("user_collections")
		.insert({
			user_id: user.id,
			title: parsed.value.title,
			description: parsed.value.description,
			is_public: parsed.value.isPublic,
		})
		.select("id, title, is_public")
		.single();
	if (insertError || !data) {
		// 上限（179 のトリガー）
		if (insertError?.code === "22023") {
			return json({ message: `コレクションは${MAX_COLLECTIONS_PER_USER}個まで作れます` }, { status: 400 });
		}
		console.error("collection create error:", insertError);
		error(500, "コレクションの作成に失敗しました");
	}

	const { error: rpcError } = await supabase.rpc("set_collection_items", {
		p_collection_id: data.id,
		p_anime_ids: [animeId],
	});
	if (rpcError) console.error("set_collection_items error:", rpcError);
	// 作品を入れられなくてもコレクションはできているので、一覧には入っていない状態で返す
	const cover = rpcError ? null : await getAnimeCoverUrl(supabase, animeId);
	return json({
		collection: { ...data, item_count: rpcError ? 0 : 1, has_anime: !rpcError, cover },
		...(rpcError ? { message: "コレクションは作りましたが、作品を入れられませんでした" } : {}),
	});
};
