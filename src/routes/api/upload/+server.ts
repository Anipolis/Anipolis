import { error, json } from "@sveltejs/kit";
import { MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit, validateImageBuffer } from "$lib/server/upload";
import type { RequestHandler } from "./$types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

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
