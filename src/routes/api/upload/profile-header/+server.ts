import { error, json } from "@sveltejs/kit";
import {
	MULTIPART_OVERHEAD_BYTES,
	publicUrlToStoragePath,
	readFormDataWithLimit,
	validateImageBuffer,
} from "$lib/server/upload";
import type { RequestHandler } from "./$types";

const BUCKET = "profile-headers";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const form = await readFormDataWithLimit(request, MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES);
	if (form === "too_large") error(413, "ファイルサイズが大きすぎます（最大5MB）");
	if (form === "invalid") error(400, "ファイルが指定されていません");

	const file = form.get("file") as File | null;
	if (!file || file.size === 0) error(400, "ファイルが指定されていません");
	if (!ALLOWED_TYPES.includes(file.type)) error(400, "対応していないファイル形式です（JPEG/PNG/WebP）");
	if (file.size > MAX_FILE_SIZE) error(400, "ファイルサイズが大きすぎます（最大5MB）");

	const arrayBuffer = await file.arrayBuffer();
	const validated = validateImageBuffer(arrayBuffer, ALLOWED_TYPES);
	if (!validated) error(400, "対応していないファイル形式です（JPEG/PNG/WebP）");

	const { data: currentProfile, error: profileError } = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user.id)
		.maybeSingle();
	if (profileError || !currentProfile) error(500, "プロフィールの取得に失敗しました");
	const previousUrl = (currentProfile as (typeof currentProfile & { header_url?: string | null }) | null)?.header_url;
	const path = `${user.id}/header_${Date.now()}.${validated.ext}`;
	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, arrayBuffer, { contentType: validated.mime, upsert: false });

	if (uploadError) {
		console.error("profile header upload error:", uploadError);
		error(500, "ヘッダー画像のアップロードに失敗しました");
	}

	const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
	const { data: updatedProfile, error: dbError } = await supabase
		.from("profiles")
		.update({ header_url: publicUrlData.publicUrl } as never)
		.eq("id", user.id)
		.select("id")
		.maybeSingle();

	if (dbError || !updatedProfile) {
		await supabase.storage.from(BUCKET).remove([path]);
		console.error("profile header db update error:", dbError);
		error(500, "プロフィールの更新に失敗しました");
	}

	const previousPath = previousUrl ? publicUrlToStoragePath(previousUrl, BUCKET) : null;
	if (previousPath && previousPath !== path) {
		const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([previousPath]);
		if (cleanupError) console.error("profile header cleanup error:", cleanupError);
	}

	return json({ url: publicUrlData.publicUrl });
};

export const DELETE: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const { data: currentProfile, error: profileError } = await supabase
		.from("profiles")
		.select("*")
		.eq("id", user.id)
		.maybeSingle();
	if (profileError || !currentProfile) error(500, "プロフィールの取得に失敗しました");
	const headerUrl = (currentProfile as (typeof currentProfile & { header_url?: string | null }) | null)?.header_url;
	const { data: updatedProfile, error: dbError } = await supabase
		.from("profiles")
		.update({ header_url: null } as never)
		.eq("id", user.id)
		.select("id")
		.maybeSingle();

	if (dbError || !updatedProfile) {
		console.error("profile header remove error:", dbError);
		error(500, "ヘッダー画像の削除に失敗しました");
	}

	const path = headerUrl ? publicUrlToStoragePath(headerUrl, BUCKET) : null;
	if (path) {
		const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
		if (cleanupError) console.error("profile header file cleanup error:", cleanupError);
	}

	return json({ success: true });
};
