import { error, json } from "@sveltejs/kit";
import { requireAccountCanWrite } from "$lib/server/actions";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import {
	MULTIPART_OVERHEAD_BYTES,
	publicUrlToStoragePath,
	readFormDataWithLimit,
	validateImageBuffer,
} from "$lib/server/upload";
import type { RequestHandler } from "./$types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	await requireAccountCanWrite(supabase, user.id);

	const form = await readFormDataWithLimit(request, MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES);
	if (form === "too_large") error(413, "ファイルサイズが大きすぎます（最大5MB）");
	if (form === "invalid") error(400, "ファイルが指定されていません");

	const file = form.get("file") as File | null;

	if (!file || file.size === 0) error(400, "ファイルが指定されていません");
	if (!ALLOWED_TYPES.includes(file.type)) error(400, "対応していないファイル形式です（JPEG/PNG/GIF/WebP）");
	if (file.size > MAX_FILE_SIZE) error(400, "ファイルサイズが大きすぎます（最大5MB）");

	// 保存する MIME・拡張子は申告値（file.type / ファイル名）ではなくマジックバイトの判定結果を使う
	const arrayBuffer = await file.arrayBuffer();
	const validated = validateImageBuffer(arrayBuffer, ALLOWED_TYPES);
	if (!validated) error(400, "対応していないファイル形式です（JPEG/PNG/GIF/WebP）");

	const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${validated.ext}`;

	const { error: uploadError } = await supabase.storage
		.from("post-images")
		.upload(path, arrayBuffer, { contentType: validated.mime });

	if (uploadError) {
		console.error("upload error:", uploadError);
		error(500, "アップロードに失敗しました");
	}

	const {
		data: { publicUrl },
	} = supabase.storage.from("post-images").getPublicUrl(path);

	return json({ url: publicUrl });
};

/**
 * 投稿欄で外した画像・破棄した下書きの画像を消す（#330）。
 * 画像は選んだ時点で保存されるので、投稿しなかった画像を消す経路が無いと公開 URL のまま残り続ける。
 * 自分のフォルダの画像だけを、どの投稿にも使われていないことを確かめてから消す
 * （別の端末で投稿済みの画像などを消さないため。投稿の参照は RLS に左右されないよう service role で見る）。
 * 投稿欄を閉じて放置された画像は、scripts/sweep-orphan-post-images.ts が期限付きで回収する。
 */
export const DELETE: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
	const url = typeof body?.url === "string" ? body.url : null;
	const path = url ? publicUrlToStoragePath(url, "post-images") : null;
	if (!url || !path?.startsWith(`${user.id}/`)) error(400, "画像のURLが不正です");

	const { data: usedBy, error: referenceError } = await createServiceRoleClient()
		.from("posts")
		.select("id")
		.contains("image_urls", [url])
		.limit(1);
	if (referenceError) {
		console.error("upload delete reference check error:", referenceError);
		error(500, "画像を削除できませんでした");
	}
	if ((usedBy ?? []).length > 0) return json({ removed: false });

	const { error: removeError } = await supabase.storage.from("post-images").remove([path]);
	if (removeError) {
		console.error("upload delete error:", removeError);
		error(500, "画像を削除できませんでした");
	}
	return json({ removed: true });
};
