// anime-covers バケットの原寸カバーから一覧・通知・検索候補などの小さな表示用サムネイル
// （幅 160px の AVIF）を生成して thumbs/160/ にアップロードする。
// 命名規約は src/lib/anime-cover.ts。表示側はサムネイルが無ければ原寸へフォールバックするので、
// 生成は後追いでよい（管理画面のアップロードは Workers 上で sharp を使えないため）。
//
//   pnpm generate:cover-thumbnails                 # 未生成・原寸が更新されたものだけ
//   pnpm generate:cover-thumbnails -- --dry-run    # アップロードせずサイズだけ確認
//   pnpm generate:cover-thumbnails -- --out tmp/thumbs   # 生成物をローカルにも保存
//   pnpm generate:cover-thumbnails -- --force      # 全件作り直す
//   pnpm generate:cover-thumbnails -- --prune      # 原寸が無くなったサムネイルを削除

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
	ANIME_COVER_BUCKET,
	COVER_THUMB_PREFIX,
	COVER_THUMB_WIDTH,
	coverThumbObjectName,
	isCoverSourceObject,
} from "../src/lib/anime-cover.ts";

const AVIF_QUALITY = 50;
const AVIF_EFFORT = 4;
const LIST_PAGE_SIZE = 1000;
const CONCURRENCY = 4;

interface StoredObject {
	name: string;
	updatedAt: number;
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const serviceRoleKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before running the generator.",
		);
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

async function listObjects(supabase: SupabaseClient, folder: string): Promise<StoredObject[]> {
	const objects: StoredObject[] = [];
	for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
		const { data, error } = await supabase.storage
			.from(ANIME_COVER_BUCKET)
			.list(folder, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
		if (error) throw new Error(`Could not list ${ANIME_COVER_BUCKET}/${folder}: ${error.message}`);
		for (const entry of data) {
			// id が null のエントリはフォルダ
			if (!entry.id) continue;
			const name = folder ? `${folder}/${entry.name}` : entry.name;
			objects.push({ name, updatedAt: Date.parse(entry.updated_at ?? entry.created_at ?? "") || 0 });
		}
		if (data.length < LIST_PAGE_SIZE) return objects;
	}
}

async function renderThumbnail(source: Buffer): Promise<Buffer> {
	return sharp(source)
		.rotate()
		.resize({ width: COVER_THUMB_WIDTH, withoutEnlargement: true })
		.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
		.toBuffer();
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
	let next = 0;
	const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) {
			const item = items[next++] as T;
			await worker(item);
		}
	});
	await Promise.all(runners);
}

async function main() {
	const { values } = parseArgs({
		// pnpm は `pnpm <script> -- --flag` の区切りの `--` もそのまま渡してくる
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options: {
			"dry-run": { type: "boolean", default: false },
			force: { type: "boolean", default: false },
			prune: { type: "boolean", default: false },
			out: { type: "string" },
		},
	});
	const dryRun = values["dry-run"];
	const outDir = values.out;
	const supabase = getSupabaseClient();

	const [rootObjects, thumbObjects] = await Promise.all([
		listObjects(supabase, ""),
		listObjects(supabase, COVER_THUMB_PREFIX.replace(/\/$/, "")),
	]);
	const thumbs = new Map(thumbObjects.map((object) => [object.name, object.updatedAt]));

	// 拡張子違いの同名（5.jpg と 5.avif など）は同じサムネイルになるので新しい方を採る
	const sourcesByThumb = new Map<string, StoredObject>();
	for (const object of rootObjects.filter((o) => isCoverSourceObject(o.name))) {
		const thumbName = coverThumbObjectName(object.name);
		const current = sourcesByThumb.get(thumbName);
		if (current) {
			console.warn(
				`Duplicate cover names for ${thumbName}: ${current.name}, ${object.name} (using the newer one)`,
			);
			if (current.updatedAt >= object.updatedAt) continue;
		}
		sourcesByThumb.set(thumbName, object);
	}

	const pending = [...sourcesByThumb].filter(([thumbName, source]) => {
		if (values.force) return true;
		const thumbUpdatedAt = thumbs.get(thumbName);
		return thumbUpdatedAt === undefined || thumbUpdatedAt < source.updatedAt;
	});
	console.log(
		`${sourcesByThumb.size} covers, ${thumbs.size} thumbnails, ${pending.length} to generate${dryRun ? " (dry run)" : ""}.`,
	);

	if (outDir) await mkdir(outDir, { recursive: true });
	let generated = 0;
	let failed = 0;
	let sourceBytes = 0;
	let thumbBytes = 0;

	await runPool(pending, async ([thumbName, source]) => {
		try {
			const { data, error } = await supabase.storage.from(ANIME_COVER_BUCKET).download(source.name);
			if (error || !data) throw new Error(error?.message ?? "empty download");
			const sourceBuffer = Buffer.from(await data.arrayBuffer());
			const thumb = await renderThumbnail(sourceBuffer);
			if (outDir) await writeFile(join(outDir, thumbName.slice(COVER_THUMB_PREFIX.length)), thumb);
			if (!dryRun) {
				const { error: uploadError } = await supabase.storage
					.from(ANIME_COVER_BUCKET)
					.upload(thumbName, thumb, { contentType: "image/avif", upsert: true });
				if (uploadError) throw new Error(uploadError.message);
			}
			generated++;
			sourceBytes += sourceBuffer.length;
			thumbBytes += thumb.length;
		} catch (error) {
			failed++;
			console.error(`Failed ${source.name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	const kib = (bytes: number) => (bytes / 1024).toFixed(1);
	console.log(
		`Generated ${generated} thumbnails (${kib(sourceBytes)} KiB of covers -> ${kib(thumbBytes)} KiB), ${failed} failed.`,
	);

	const orphans = [...thumbs.keys()].filter((thumbName) => !sourcesByThumb.has(thumbName));
	if (orphans.length > 0) {
		if (values.prune && !dryRun) {
			const { error } = await supabase.storage.from(ANIME_COVER_BUCKET).remove(orphans);
			if (error) throw new Error(`Could not prune orphan thumbnails: ${error.message}`);
			console.log(`Pruned ${orphans.length} orphan thumbnails.`);
		} else {
			console.log(`${orphans.length} orphan thumbnails (run with --prune to delete).`);
		}
	}

	if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
