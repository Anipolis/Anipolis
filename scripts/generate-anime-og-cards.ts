// 作品ごとの共有用カード（1200x630 の JPEG、#271）を作って anime-covers/og/ にアップロードする。
// 配信は /og/anime/[id]（無ければ既定の画像）。命名規約は src/lib/anime-og.ts。
// Workers では sharp を使えないため、カバーのサムネイルと同じく手元で後追いで作る。
//
// 対象は既定で「前期・今期・次期」の作品（共有されやすい）。過去の作品は --since で広げる。
//
//   pnpm generate:anime-og-cards                       # 前期・今期・次期の未作成分だけ
//   pnpm generate:anime-og-cards -- --since 2020       # 2020 年以降の作品
//   pnpm generate:anime-og-cards -- --anime 17651      # 1 作品だけ（作り直しも兼ねる）
//   pnpm generate:anime-og-cards -- --dry-run --out tmp/og   # アップロードせずローカルに保存

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ANIME_COVER_BUCKET, coverObjectNameFromUrl } from "../src/lib/anime-cover.ts";
import { ANIME_OG_PREFIX, type AnimeOgSource, animeOgObjectName } from "../src/lib/anime-og.ts";
import { renderAnimeOgCard } from "./anime-og-card.ts";

const LIST_PAGE_SIZE = 1000;
const DB_PAGE_SIZE = 1000;
const CONCURRENCY = 4;
const SEASONS = ["winter", "spring", "summer", "fall"] as const;

interface AnimeRow extends AnimeOgSource {
	id: number;
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const serviceRoleKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error("Set PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before running the generator.");
	}
	return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 前期・今期・次期（JST） */
export function recentSeasons(now = new Date()): string[] {
	const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
	const index = Math.floor(jst.getUTCMonth() / 3);
	const result: string[] = [];
	for (const offset of [-1, 0, 1]) {
		const total = jst.getUTCFullYear() * 4 + index + offset;
		result.push(`${Math.floor(total / 4)}-${SEASONS[((total % 4) + 4) % 4]}`);
	}
	return result;
}

async function listExisting(supabase: SupabaseClient): Promise<Set<string>> {
	const names = new Set<string>();
	const folder = ANIME_OG_PREFIX.replace(/\/$/, "");
	for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
		const { data, error } = await supabase.storage
			.from(ANIME_COVER_BUCKET)
			.list(folder, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
		if (error) throw new Error(`Could not list ${ANIME_COVER_BUCKET}/${folder}: ${error.message}`);
		for (const entry of data) if (entry.id) names.add(`${folder}/${entry.name}`);
		if (data.length < LIST_PAGE_SIZE) return names;
	}
}

async function fetchAnime(
	supabase: SupabaseClient,
	filter: { animeId?: number; seasons?: string[]; since?: number },
): Promise<AnimeRow[]> {
	const rows: AnimeRow[] = [];
	for (let start = 0; ; start += DB_PAGE_SIZE) {
		let query = supabase
			.from("anime")
			.select("id,title,cover_url,copyright,season,type")
			.not("cover_url", "is", null)
			.not("copyright", "is", null)
			.order("id", { ascending: true })
			.range(start, start + DB_PAGE_SIZE - 1);
		if (filter.animeId !== undefined) query = query.eq("id", filter.animeId);
		else if (filter.since !== undefined) query = query.gte("season", `${filter.since}-`);
		else if (filter.seasons) query = query.in("season", filter.seasons);
		const { data, error } = await query;
		if (error) throw new Error(`Could not read anime: ${error.message}`);
		rows.push(...((data ?? []) as AnimeRow[]));
		if (!data || data.length < DB_PAGE_SIZE) return rows;
	}
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
	let next = 0;
	const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
		while (next < items.length) await worker(items[next++] as T);
	});
	await Promise.all(runners);
}

async function main() {
	const { values } = parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options: {
			"dry-run": { type: "boolean", default: false },
			anime: { type: "string" },
			since: { type: "string" },
			out: { type: "string" },
		},
	});
	const dryRun = values["dry-run"];
	const supabase = getSupabaseClient();
	const animeId = values.anime ? Number(values.anime) : undefined;
	const since = values.since ? Number(values.since) : undefined;
	if (animeId !== undefined && !Number.isInteger(animeId)) throw new Error(`Invalid --anime: ${values.anime}`);
	if (since !== undefined && !Number.isInteger(since)) throw new Error(`Invalid --since: ${values.since}`);
	const seasons = recentSeasons();

	const [anime, existing] = await Promise.all([
		fetchAnime(supabase, animeId !== undefined ? { animeId } : since !== undefined ? { since } : { seasons }),
		listExisting(supabase),
	]);
	const targets = anime.flatMap((row) => {
		const name = animeOgObjectName(row);
		return name ? [{ row, name }] : [];
	});
	// --anime は作り直しも兼ねるので、既にあっても作る
	const pending = animeId !== undefined ? targets : targets.filter((target) => !existing.has(target.name));
	console.log(
		`${anime.length} anime (${animeId !== undefined ? `id ${animeId}` : since !== undefined ? `since ${since}` : seasons.join(", ")}), ${targets.length} with a visible cover, ${pending.length} to generate${dryRun ? " (dry run)" : ""}.`,
	);

	if (values.out) await mkdir(values.out, { recursive: true });
	let generated = 0;
	let failed = 0;
	let bytes = 0;
	await runPool(pending, async ({ row, name }) => {
		try {
			const coverName = row.cover_url ? coverObjectNameFromUrl(row.cover_url) : null;
			if (!coverName) throw new Error("cover is not in the anime-covers bucket");
			const { data, error } = await supabase.storage.from(ANIME_COVER_BUCKET).download(coverName);
			if (error || !data) throw new Error(error?.message ?? "empty download");
			const card = await renderAnimeOgCard({
				title: row.title,
				copyright: row.copyright ?? "",
				season: row.season,
				type: row.type,
				cover: Buffer.from(await data.arrayBuffer()),
			});
			if (values.out) await writeFile(join(values.out, name.slice(ANIME_OG_PREFIX.length)), card);
			if (!dryRun) {
				const { error: uploadError } = await supabase.storage
					.from(ANIME_COVER_BUCKET)
					.upload(name, card, { contentType: "image/jpeg", upsert: true });
				if (uploadError) throw new Error(uploadError.message);
			}
			generated++;
			bytes += card.length;
		} catch (error) {
			failed++;
			console.error(`Failed anime ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});
	console.log(`Generated ${generated} cards (${(bytes / 1024).toFixed(1)} KiB), ${failed} failed.`);
	if (failed > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
