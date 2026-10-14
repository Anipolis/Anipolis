import { createClient } from "@supabase/supabase-js";
import { shouldSweepPostImage } from "../src/lib/post-image-lifetime.ts";
import { publicUrlToStoragePath } from "../src/lib/server/upload.ts";

// post-images のうち、どの投稿にも使われていない古い画像を消す（#330）。
//
// 画像は投稿欄で選んだ時点で保存される。外した・破棄した画像はその場で消すが（DELETE /api/upload）、
// 投稿欄を閉じて放置した・通信に失敗したなどで残ったものをここで回収する。
// 投稿していない画像はアップロードから7日までしか使えない（下書きの復元・投稿時に外す／拒否する。
// src/lib/post-image-lifetime.ts）。それより1日長い8日を過ぎたものだけを対象にする。
// 下書きは編集のたびに期限が延びるので、下書きの期限ではなく画像の使用期限を基準にしている。
//
//   pnpm sweep:orphan-post-images            # 確認だけ（消さない）
//   pnpm sweep:orphan-post-images -- --apply # 消す

const apply = process.argv.includes("--apply");
const BUCKET = "post-images";
const PAGE_SIZE = 1000;

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const supabase = getSupabaseClient();

/** 投稿から参照されている post-images のパス */
async function referencedPaths(): Promise<Set<string>> {
	const paths = new Set<string>();
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("posts")
			.select("id, image_urls")
			.neq("image_urls", "{}")
			.order("id")
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(error.message);
		for (const row of data ?? []) {
			for (const url of (row.image_urls as string[] | null) ?? []) {
				const path = publicUrlToStoragePath(url, BUCKET);
				if (path) paths.add(path);
			}
		}
		if ((data ?? []).length < PAGE_SIZE) return paths;
	}
}

/** バケット直下のフォルダ（利用者 ID）ごとに、ファイルと作成日時を集める */
async function listObjects(): Promise<{ path: string; createdAt: number }[]> {
	const objects: { path: string; createdAt: number }[] = [];
	// フォルダの一覧もページを追う（利用者が PAGE_SIZE を超えても後ろのフォルダを取りこぼさない）
	const folders: { name: string; id: string | null }[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase.storage
			.from(BUCKET)
			.list("", { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
		if (error) throw new Error(error.message);
		folders.push(...(data ?? []));
		if ((data ?? []).length < PAGE_SIZE) break;
	}
	for (const folder of folders) {
		if (folder.id !== null) continue; // 直下のファイルは扱わない（パスは <user_id>/... で統一）
		for (let offset = 0; ; offset += PAGE_SIZE) {
			const { data: files, error: listError } = await supabase.storage
				.from(BUCKET)
				.list(folder.name, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
			if (listError) throw new Error(listError.message);
			for (const file of files ?? []) {
				if (file.id === null) continue;
				const createdAt = Date.parse(file.created_at ?? "");
				objects.push({
					path: `${folder.name}/${file.name}`,
					createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
				});
			}
			if ((files ?? []).length < PAGE_SIZE) break;
		}
	}
	return objects;
}

const [referenced, objects] = await Promise.all([referencedPaths(), listObjects()]);
const now = Date.now();
const orphans = objects.filter((object) => shouldSweepPostImage(object.path, object.createdAt, referenced, now));

console.log(
	`${apply ? "APPLY" : "DRY RUN"}: ${objects.length} objects, ${referenced.size} referenced, ${orphans.length} orphans older than 8 days`,
);
for (const orphan of orphans.slice(0, 20)) {
	console.log(`  ${orphan.path} (${new Date(orphan.createdAt).toISOString().slice(0, 10)})`);
}
if (orphans.length > 20) console.log(`  ... and ${orphans.length - 20} more`);

if (apply && orphans.length > 0) {
	let removed = 0;
	for (let start = 0; start < orphans.length; start += 100) {
		const batch = orphans.slice(start, start + 100).map((orphan) => orphan.path);
		const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
		if (error) throw new Error(error.message);
		removed += data?.length ?? 0;
	}
	console.log(`removed: ${removed}`);
}
