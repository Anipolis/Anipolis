import { error, json } from "@sveltejs/kit";
import { requireAccountCanWrite } from "$lib/server/actions";
import { MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit, validateImageBuffer } from "$lib/server/upload";
import type { RequestHandler } from "./$types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	await requireAccountCanWrite(supabase, user.id);

	const form = await readFormDataWithLimit(request, MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES);
	if (form === "too_large") error(413, "ファイルサイズが大きすぎます（最大2MB）");
	if (form === "invalid") error(400, "ファイルが指定されていません");

	const file = form.get("file") as File | null;

	if (!file || file.size === 0) error(400, "ファイルが指定されていません");
	if (!ALLOWED_TYPES.includes(file.type)) error(400, "対応していないファイル形式です（JPEG/PNG/WebP）");
	if (file.size > MAX_FILE_SIZE) error(400, "ファイルサイズが大きすぎます（最大2MB）");

	// 保存する MIME・拡張子は申告値ではなくマジックバイトの判定結果を使う
	const arrayBuffer = await file.arrayBuffer();
	const validated = validateImageBuffer(arrayBuffer, ALLOWED_TYPES);
	if (!validated) error(400, "対応していないファイル形式です（JPEG/PNG/WebP）");

	// 置き換え成功後に削除するため、既存ファイル一覧を先に控える
	const { data: existingFiles } = await supabase.storage.from("profile-avatars").list(user.id);

	// キャッシュ回避のためタイムスタンプを付与
	const path = `${user.id}/avatar_${Date.now()}.${validated.ext}`;

	const { error: uploadError } = await supabase.storage
		.from("profile-avatars")
		.upload(path, arrayBuffer, { contentType: validated.mime, upsert: true });

	if (uploadError) {
		console.error("avatar upload error:", uploadError);
		error(500, "アップロードに失敗しました");
	}

	const {
		data: { publicUrl },
	} = supabase.storage.from("profile-avatars").getPublicUrl(path);

	const { error: dbError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);

	if (dbError) {
		console.error("avatar db update error:", dbError);
		error(500, "プロフィールの更新に失敗しました");
	}

	// 旧アバターを削除（ベストエフォート — 失敗しても新アバターは有効）
	const stalePaths = (existingFiles ?? []).map((f) => `${user.id}/${f.name}`).filter((p) => p !== path);
	if (stalePaths.length > 0) {
		const { error: cleanupError } = await supabase.storage.from("profile-avatars").remove(stalePaths);
		if (cleanupError) console.error("avatar cleanup error:", cleanupError);
	}

	return json({ url: publicUrl });
};

// アイコン画像を外す（頭文字のアイコンに戻す）。ヘッダー画像の削除と同じく、先にプロフィールを空にしてからファイルを消す
export const DELETE: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");
	await requireAccountCanWrite(supabase, user.id);

	const { data: updatedProfile, error: dbError } = await supabase
		.from("profiles")
		.update({ avatar_url: null })
		.eq("id", user.id)
		.select("id")
		.maybeSingle();
	if (dbError || !updatedProfile) {
		console.error("avatar remove error:", dbError);
		error(500, "アイコン画像の削除に失敗しました");
	}

	// 自分のフォルダのアイコンを消す（ベストエフォート — 失敗してもプロフィールからは外れている）
	const { data: files } = await supabase.storage.from("profile-avatars").list(user.id);
	const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
	if (paths.length > 0) {
		const { error: cleanupError } = await supabase.storage.from("profile-avatars").remove(paths);
		if (cleanupError) console.error("avatar file cleanup error:", cleanupError);
	}

	return json({ success: true });
};
