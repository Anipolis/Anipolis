import { error, redirect } from "@sveltejs/kit";
import { env as publicEnv } from "$env/dynamic/public";
import { signPostImageUrls } from "$lib/server/post-image-signing";
import type { RequestHandler } from "./$types";

/** <user_id>/<ファイル名> の形だけを受け付ける（.. やサブフォルダは不可） */
const PATH_PATTERN = /^[0-9a-f-]{36}\/[\w.-]+$/i;

/**
 * 投稿画像の固定リンク（#316）。OGP など外に出るリンクと、投稿欄のプレビューで使う。
 *
 * post-images は非公開（151）なので、アクセスのたびに閲覧権限を確かめ、その時点の期限付き URL へ
 * 転送する。画像のデータそのものは Storage から直接届く。
 * 見てよいのは、本人の画像か、閲覧者の権限（RLS）で読める「画像の持ち主自身の」投稿に使われている画像。
 * 他人の画像を参照する投稿を経由させない（PR #380 レビュー。保存時の検査は 148）。鍵アカウントで
 * フォロワーでない・管理者非表示・BAN・ブロック・削除済みの投稿の画像は 404 にする。
 */
export const GET: RequestHandler = async ({ params, setHeaders, locals: { supabase, safeGetSession } }) => {
	const path = params.path;
	if (!PATH_PATTERN.test(path)) error(404, "画像が見つかりません");

	const supabaseUrl = publicEnv["PUBLIC_SUPABASE_URL"];
	if (!supabaseUrl) error(500, "設定が不足しています");
	// image_urls には getPublicUrl の形で保存している（識別子として使う）
	const storedUrl = `${supabaseUrl}/storage/v1/object/public/post-images/${path}`;

	const ownerId = path.split("/")[0] ?? "";
	const { user } = await safeGetSession();
	const isOwner = user?.id === ownerId;
	if (!isOwner) {
		const { data, error: lookupError } = await supabase
			.from("posts")
			.select("id")
			.eq("user_id", ownerId)
			.contains("image_urls", [storedUrl])
			.limit(1);
		if (lookupError) {
			console.error("post image lookup failed:", lookupError);
			error(500, "画像を表示できませんでした");
		}
		if (!data || data.length === 0) error(404, "画像が見つかりません");
	}

	const signed = (await signPostImageUrls([storedUrl])).get(storedUrl);
	// 発行に失敗すると固定リンク（このエンドポイント）が返るので、転送せずに失敗とする
	if (!signed || signed.startsWith("/api/media/")) error(503, "画像を表示できませんでした");

	// 閲覧者によって結果が変わるので、共有キャッシュには載せない。転送先の URL は期限まで使える
	setHeaders({ "cache-control": "private, max-age=300" });
	redirect(302, signed);
};
