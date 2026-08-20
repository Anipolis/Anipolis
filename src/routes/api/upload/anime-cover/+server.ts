import { createClient } from "@supabase/supabase-js";
import { error, json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { isAdminUser } from "$lib/server/queries";
import { MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit, validateImageBuffer } from "$lib/server/upload";
import type { RequestHandler } from "./$types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	if (!(await isAdminUser(supabase, user.id))) error(403, "権限がありません");

	const form = await readFormDataWithLimit(request, MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES);
	if (form === "too_large") error(413, "ファイルサイズが大きすぎます（最大10MB）");
	if (form === "invalid") error(400, "ファイルが指定されていません");

	const fileEntry = form.get("file");
	const animeIdEntry = form.get("anime_id");

	if (!(fileEntry instanceof File) || fileEntry.size === 0) error(400, "ファイルが指定されていません");
	const file = fileEntry;

	if (typeof animeIdEntry !== "string") error(400, "アニメIDが指定されていません");
	const animeId = animeIdEntry.trim();
	if (animeId.length === 0) error(400, "アニメIDが指定されていません");
	if (/[/\\:\0]/.test(animeId)) error(400, "アニメIDに無効な文字が含まれています");

	if (!ALLOWED_TYPES.includes(file.type)) error(400, "対応していないファイル形式です（JPEG/PNG/WebP/AVIF）");
	if (file.size > MAX_FILE_SIZE) error(400, "ファイルサイズが大きすぎます（最大10MB）");

	// 保存する MIME・拡張子は申告値ではなくマジックバイトの判定結果を使う
	const arrayBuffer = await file.arrayBuffer();
	const validated = validateImageBuffer(arrayBuffer, ALLOWED_TYPES);
	if (!validated) error(400, "対応していないファイル形式です（JPEG/PNG/WebP/AVIF）");

	const path = `${animeId}.${validated.ext}`;

	const { error: uploadError } = await supabase.storage
		.from("anime-covers")
		.upload(path, arrayBuffer, { contentType: validated.mime, upsert: true });

	if (uploadError) {
		console.error("anime cover upload error:", uploadError);
		error(500, "アップロードに失敗しました");
	}

	const {
		data: { publicUrl },
	} = supabase.storage.from("anime-covers").getPublicUrl(path);

	const secretKey = env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!secretKey) error(500, "Supabaseの管理キーが設定されていません");
	const adminClient = createClient(PUBLIC_SUPABASE_URL, secretKey);
	const { data: updatedRow, error: updateError } = await adminClient
		.from("anime")
		.update({ cover_url: publicUrl })
		.eq("id", animeId)
		.select("id")
		.single();

	if (updateError || !updatedRow) {
		console.error("anime cover_url update error (animeId=%s):", animeId, updateError ?? "no matching row");
		const { error: deleteError } = await adminClient.storage.from("anime-covers").remove([path]);
		if (deleteError) {
			console.error("anime cover storage cleanup error (path=%s):", path, deleteError);
		}
		error(500, "DBの更新に失敗しました");
	}

	return json({ url: publicUrl });
};
