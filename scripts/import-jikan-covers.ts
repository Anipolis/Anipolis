// Jikan（MAL）のカバー画像を取り込み、anime-covers バケットに AVIF で保存して出典を
// anime_cover_assets に記録する。--publish を付けたときだけ承認済みのものを anime.cover_url に載せる。
//
//   pnpm import:jikan-covers -- --dry-run --limit 20 --out tmp/covers   # 取得と変換だけ試す
//   pnpm import:jikan-covers -- --season 2024-winter                     # 保存と記録（未公開）
//   pnpm import:jikan-covers -- --publish                                # 保存・記録・公開
//   pnpm import:jikan-covers -- --anime-id 714 --anime-id 715 --publish  # 作品を指定（種別・シーズンは問わない）
//
// 対象: mal_id があり、カバーが無く、非表示でない作品（既定は TV と Movie）。
// 管理者が登録・編集した作品で manual レコードに cover_url があるもの（null を含む）は、
// カタログ再解決で manual の値が優先されて取り込んでも消えるため対象外にして件数だけ出す。
// 縦横比が既存カバー（1:1.414）から大きく外れる画像は needs_review にして公開しない。
//
// 公開した cover_url は取り込み元（Jikan/MAL/offline）が null しか持たないので、
// resolve:anime-catalog では legacy（既存行）の値として保持される。

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ANIME_COVER_BUCKET, coverThumbObjectName } from "../src/lib/anime-cover.ts";
import {
	importedCoverObjectName,
	type JikanImageSet,
	reviewImportedCover,
	selectJikanCoverImageUrl,
} from "../src/lib/anime-cover-import.ts";
import { fetchWithRetry } from "../src/lib/utils/http-retry.ts";
import { ConsecutiveStatusCircuitBreaker } from "../src/lib/utils/jikan-import-resilience.ts";
import { encodeImportedCover, renderCoverThumbnail } from "./cover-encoding.ts";

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
// JIKAN_BASE_URL があればセルフホストの jikan-rest から取得する（記録する URL は公式のまま）
const JIKAN_FETCH_BASE_URL = process.env["JIKAN_BASE_URL"] ?? JIKAN_BASE_URL;
const JIKAN_WAIT_MIN_MS = 1_100;
const JIKAN_WAIT_MAX_MS = 1_500;
const CDN_WAIT_MS = 400;
const USER_AGENT = "Anipolis cover importer";
const CACHE_PATH = join(process.cwd(), ".jikan-import-cache", "cover-image-urls.json");
const CACHE_DIRECTORY = join(process.cwd(), ".jikan-import-cache");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 内容ハッシュ入りの名前で上書きしないので長期キャッシュしてよい
const IMMUTABLE_CACHE_SECONDS = "31536000";
const PAGE_SIZE = 1000;
const DEFAULT_TYPES = ["TV", "Movie"];
const JIKAN_TYPE_FILTERS: Record<string, string> = {
	TV: "tv",
	Movie: "movie",
	OVA: "ova",
	ONA: "ona",
	Special: "special",
};
const SEASON_PATTERN = /^(\d{4})-(winter|spring|summer|fall)$/;
const SEASON_ORDER = ["winter", "spring", "summer", "fall"];

/** シーズンを時系列で比べるための数値（"2024-fall" > "2024-winter"）。不明は最後尾 */
function seasonRank(season: string | null): number {
	const match = season ? SEASON_PATTERN.exec(season) : null;
	return match ? Number(match[1]) * 4 + SEASON_ORDER.indexOf(match[2] ?? "") : -1;
}

type Candidate = { id: number; malId: number; type: string | null; season: string | null };
type CachedImage = { imageUrl: string | null; apiUrl: string; fetchedAt: string };
type ImageCache = { version: 1; entries: Record<string, CachedImage> };
type JikanListItem = { mal_id: number; images?: JikanImageSet };
type JikanListResponse = { data?: JikanListItem[]; pagination?: { has_next_page?: boolean } };
type JikanAnimeResponse = { data?: JikanListItem };

const jikanCircuitBreaker = new ConsecutiveStatusCircuitBreaker(504, 5);

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const serviceRoleKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before running the importer.",
		);
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

class JikanCircuitOpenError extends Error {}

async function fetchJikanJson<T>(path: string): Promise<T | null> {
	try {
		const response = await fetchWithRetry(
			`${JIKAN_FETCH_BASE_URL}${path}`,
			{ headers: { Accept: "application/json", "User-Agent": USER_AGENT } },
			{
				afterAttempt: () => sleep(JIKAN_WAIT_MIN_MS + Math.random() * (JIKAN_WAIT_MAX_MS - JIKAN_WAIT_MIN_MS)),
				onResponse: (res) => {
					if (jikanCircuitBreaker.record(res.status)) {
						throw new JikanCircuitOpenError("Jikan returned 5 consecutive HTTP 504 responses; stopping.");
					}
				},
			},
		);
		if (!response.ok) {
			console.warn(`Jikan ${path}: HTTP ${response.status}`);
			return null;
		}
		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof JikanCircuitOpenError) throw error;
		console.warn(`Jikan ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

// ---------------------------------------------------------------- image URL cache

async function loadImageCache(): Promise<ImageCache> {
	if (!existsSync(CACHE_PATH)) return { version: 1, entries: {} };
	const parsed = JSON.parse(await readFile(CACHE_PATH, "utf8")) as ImageCache;
	return parsed.version === 1 ? parsed : { version: 1, entries: {} };
}

async function saveImageCache(cache: ImageCache) {
	await mkdir(CACHE_DIRECTORY, { recursive: true });
	await writeFile(CACHE_PATH, JSON.stringify(cache));
}

function freshCacheEntry(cache: ImageCache, malId: number): CachedImage | undefined {
	const entry = cache.entries[String(malId)];
	if (!entry) return undefined;
	return Date.now() - Date.parse(entry.fetchedAt) < CACHE_TTL_MS ? entry : undefined;
}

function remember(cache: ImageCache, item: JikanListItem, apiUrl: string) {
	cache.entries[String(item.mal_id)] = {
		imageUrl: selectJikanCoverImageUrl(item.images),
		apiUrl,
		fetchedAt: new Date().toISOString(),
	};
}

/** import:jikan のチェックポイント（/anime/{id}/full の生レスポンス）に画像 URL が既にあれば使う */
async function seedFromSeasonCheckpoints(cache: ImageCache) {
	if (!existsSync(CACHE_DIRECTORY)) return 0;
	let seeded = 0;
	for (const file of await readdir(CACHE_DIRECTORY)) {
		if (!SEASON_PATTERN.test(file.replace(/\.json$/, ""))) continue;
		const checkpoint = JSON.parse(await readFile(join(CACHE_DIRECTORY, file), "utf8")) as {
			animeByMalId?: Record<string, JikanListItem | null>;
		};
		for (const item of Object.values(checkpoint.animeByMalId ?? {})) {
			if (!item?.mal_id || freshCacheEntry(cache, item.mal_id)) continue;
			remember(cache, item, `${JIKAN_BASE_URL}/anime/${item.mal_id}/full`);
			seeded++;
		}
	}
	return seeded;
}

async function resolveImageUrls(candidates: Candidate[], cache: ImageCache, types: string[]) {
	const missing = () => candidates.filter((c) => !freshCacheEntry(cache, c.malId));

	// 1. シーズン一覧（種別ごと）。1 ページ 25 件なので作品ごとに引くより大幅に少ない
	const seasons = [
		...new Set(
			missing()
				.map((c) => c.season)
				.filter((s): s is string => !!s),
		),
	].sort((a, b) => seasonRank(b) - seasonRank(a));
	for (const season of seasons) {
		const match = SEASON_PATTERN.exec(season);
		if (!match) continue;
		const [, year, name] = match;
		for (const type of types) {
			const filter = JIKAN_TYPE_FILTERS[type];
			if (!filter) continue;
			for (let page = 1; ; page++) {
				const path = `/seasons/${year}/${name}?filter=${filter}&page=${page}`;
				const payload = await fetchJikanJson<JikanListResponse>(path);
				if (!payload) break;
				for (const item of payload.data ?? []) remember(cache, item, `${JIKAN_BASE_URL}${path}`);
				if (payload.pagination?.has_next_page !== true) break;
			}
		}
		await saveImageCache(cache);
		console.log(`Season ${season}: ${missing().length} candidates still without an image URL.`);
	}

	// 2. 一覧に出てこなかった作品（シーズン跨ぎ・種別違いなど）は作品ごとに引く
	const rest = missing();
	for (const [index, candidate] of rest.entries()) {
		const path = `/anime/${candidate.malId}`;
		const payload = await fetchJikanJson<JikanAnimeResponse>(path);
		if (payload?.data) remember(cache, payload.data, `${JIKAN_BASE_URL}${path}`);
		if ((index + 1) % 25 === 0) {
			await saveImageCache(cache);
			console.log(`Looked up ${index + 1}/${rest.length} individual anime.`);
		}
	}
	await saveImageCache(cache);
}

// ---------------------------------------------------------------- database

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
	const rows: T[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await query(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`Query failed: ${JSON.stringify(error)}`);
		rows.push(...(data ?? []));
		if (!data || data.length < PAGE_SIZE) return rows;
	}
}

async function loadCandidates(
	supabase: SupabaseClient,
	types: string[],
	seasons: string[],
	animeIds: number[],
	dryRun: boolean,
) {
	const animeRows = await fetchAll<{ id: number; mal_id: number; type: string | null; season: string | null }>(
		(from, to) => {
			let query = supabase
				.from("anime")
				.select("id,mal_id,type,season")
				.is("cover_url", null)
				.not("mal_id", "is", null)
				.eq("hidden_by_admin", false)
				.order("id")
				.range(from, to);
			// 作品指定のときは種別・シーズンで絞らない
			if (animeIds.length > 0) return query.in("id", animeIds);
			query = query.in("type", types);
			if (seasons.length > 0) query = query.in("season", seasons);
			return query;
		},
	);
	const manualRows = await fetchAll<{ mal_id: number; normalized_data: Record<string, unknown> }>((from, to) =>
		supabase
			.from("anime_source_records")
			.select("mal_id,normalized_data")
			.eq("source", "manual")
			.order("mal_id")
			.range(from, to),
	);
	const manualCover = new Set(
		manualRows.filter((row) => Object.hasOwn(row.normalized_data ?? {}, "cover_url")).map((row) => row.mal_id),
	);
	let importedRows: { anime_id: number }[] = [];
	try {
		importedRows = await fetchAll<{ anime_id: number }>((from, to) =>
			supabase.from("anime_cover_assets").select("anime_id").eq("source", "jikan").order("id").range(from, to),
		);
	} catch (error) {
		// migration 133 適用前でも --dry-run で試せるようにする
		if (!dryRun) throw error;
		console.warn(
			"anime_cover_assets is not readable (migration 133 not applied?); assuming nothing is imported yet.",
		);
	}
	const imported = new Set(importedRows.map((row) => row.anime_id));

	const candidates: Candidate[] = [];
	let skippedManual = 0;
	let skippedImported = 0;
	for (const row of animeRows) {
		if (imported.has(row.id)) skippedImported++;
		else if (manualCover.has(row.mal_id)) skippedManual++;
		else candidates.push({ id: row.id, malId: row.mal_id, type: row.type, season: row.season });
	}
	// 新しいシーズンから処理する
	candidates.sort((a, b) => seasonRank(b.season) - seasonRank(a.season) || a.id - b.id);
	return { candidates, skippedManual, skippedImported };
}

/** 承認済みで未公開のものを anime.cover_url に載せる。既にカバーがある作品は上書きしない */
async function publishApproved(supabase: SupabaseClient, animeIds: number[]) {
	const assets = await fetchAll<{ id: number; anime_id: number; object_name: string }>((from, to) => {
		const query = supabase
			.from("anime_cover_assets")
			.select("id,anime_id,object_name")
			.eq("review_status", "approved")
			.is("published_at", null)
			.order("id")
			.range(from, to);
		// 作品指定のときは指定した作品の分だけ公開する
		return animeIds.length > 0 ? query.in("anime_id", animeIds) : query;
	});
	let published = 0;
	let alreadyCovered = 0;
	for (const asset of assets) {
		const publicUrl = supabase.storage.from(ANIME_COVER_BUCKET).getPublicUrl(asset.object_name).data.publicUrl;
		const { data, error } = await supabase
			.from("anime")
			.update({ cover_url: publicUrl })
			.eq("id", asset.anime_id)
			.is("cover_url", null)
			.select("id");
		if (error) throw new Error(`Could not publish anime ${asset.anime_id}: ${error.message}`);
		if (!data || data.length === 0) {
			alreadyCovered++;
			continue;
		}
		const { error: markError } = await supabase
			.from("anime_cover_assets")
			.update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
			.eq("id", asset.id);
		if (markError) throw new Error(`Could not mark asset ${asset.id} as published: ${markError.message}`);
		published++;
	}
	console.log(`Published ${published} covers (${alreadyCovered} skipped because the anime already has a cover).`);
}

// ---------------------------------------------------------------- import

async function downloadImage(url: string): Promise<Buffer | null> {
	const response = await fetchWithRetry(url, { headers: { "User-Agent": USER_AGENT } });
	await sleep(CDN_WAIT_MS);
	if (!response.ok) {
		console.warn(`Image ${url}: HTTP ${response.status}`);
		return null;
	}
	return Buffer.from(await response.arrayBuffer());
}

async function uploadObject(supabase: SupabaseClient, name: string, data: Buffer) {
	const { error } = await supabase.storage
		.from(ANIME_COVER_BUCKET)
		.upload(name, data, { contentType: "image/avif", upsert: true, cacheControl: IMMUTABLE_CACHE_SECONDS });
	if (error) throw new Error(`Could not upload ${name}: ${error.message}`);
}

function parsePositiveInteger(value: string, option: string) {
	const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer: ${value}`);
	return parsed;
}

async function main() {
	const { values } = parseArgs({
		// pnpm は `pnpm <script> -- --flag` の区切りの `--` もそのまま渡してくる
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options: {
			season: { type: "string", multiple: true },
			"anime-id": { type: "string", multiple: true },
			types: { type: "string" },
			limit: { type: "string" },
			"dry-run": { type: "boolean", default: false },
			publish: { type: "boolean", default: false },
			out: { type: "string" },
		},
	});
	const dryRun = values["dry-run"];
	const types = values.types ? values.types.split(",").map((t) => t.trim()) : DEFAULT_TYPES;
	const seasons = values.season ?? [];
	for (const season of seasons) {
		if (!SEASON_PATTERN.test(season)) throw new Error(`--season must look like 2024-winter: ${season}`);
	}
	const animeIds = (values["anime-id"] ?? []).map((id) => parsePositiveInteger(id, "--anime-id"));
	const limit = values.limit ? parsePositiveInteger(values.limit, "--limit") : undefined;

	const supabase = getSupabaseClient();
	const {
		candidates: allCandidates,
		skippedManual,
		skippedImported,
	} = await loadCandidates(supabase, types, seasons, animeIds, dryRun);
	const candidates = limit ? allCandidates.slice(0, limit) : allCandidates;
	console.log(
		`${allCandidates.length} candidates (${animeIds.length > 0 ? `anime ${animeIds.join("/")}` : types.join("/")}), processing ${candidates.length}${dryRun ? " (dry run)" : ""}. ` +
			`Skipped: ${skippedImported} already imported, ${skippedManual} with a manual cover_url.`,
	);

	const cache = await loadImageCache();
	const seeded = await seedFromSeasonCheckpoints(cache);
	if (seeded > 0) console.log(`Seeded ${seeded} image URLs from import:jikan checkpoints.`);
	await resolveImageUrls(candidates, cache, animeIds.length > 0 ? [] : types);

	if (values.out) await mkdir(values.out, { recursive: true });
	const stats = { approved: 0, needsReview: 0, noImage: 0, failed: 0, bytes: 0 };
	for (const [index, candidate] of candidates.entries()) {
		const entry = cache.entries[String(candidate.malId)];
		if (!entry?.imageUrl) {
			stats.noImage++;
			continue;
		}
		try {
			const source = await downloadImage(entry.imageUrl);
			if (!source) {
				stats.failed++;
				continue;
			}
			const sha256 = createHash("sha256").update(source).digest("hex");
			const cover = await encodeImportedCover(source);
			const thumb = await renderCoverThumbnail(source);
			const review = reviewImportedCover(cover.sourceWidth, cover.sourceHeight);
			const objectName = importedCoverObjectName(candidate.malId, sha256);

			if (values.out) {
				await writeFile(join(values.out, objectName), cover.data);
				await writeFile(join(values.out, `thumb-${objectName}`), thumb);
			}
			if (!dryRun) {
				await uploadObject(supabase, objectName, cover.data);
				await uploadObject(supabase, coverThumbObjectName(objectName), thumb);
				const { error } = await supabase.from("anime_cover_assets").upsert(
					{
						anime_id: candidate.id,
						mal_id: candidate.malId,
						source: "jikan",
						source_image_url: entry.imageUrl,
						source_api_url: entry.apiUrl,
						object_name: objectName,
						sha256,
						source_width: cover.sourceWidth,
						source_height: cover.sourceHeight,
						width: cover.width,
						height: cover.height,
						bytes: cover.data.length,
						review_status: review.status,
						review_reason: review.status === "needs_review" ? review.reason : null,
						fetched_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					},
					{ onConflict: "anime_id,source" },
				);
				if (error) throw new Error(`Could not record the asset: ${error.message}`);
			}
			if (review.status === "approved") stats.approved++;
			else {
				stats.needsReview++;
				console.log(`Needs review: anime ${candidate.id} (MAL ${candidate.malId}) ${review.reason}`);
			}
			stats.bytes += cover.data.length + thumb.length;
		} catch (error) {
			stats.failed++;
			console.error(
				`Failed anime ${candidate.id} (MAL ${candidate.malId}): ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if ((index + 1) % 50 === 0) console.log(`Processed ${index + 1}/${candidates.length}.`);
	}

	console.log(
		`Imported ${stats.approved} approved and ${stats.needsReview} needing review ` +
			`(${(stats.bytes / 1024 / 1024).toFixed(1)} MiB incl. thumbnails); ${stats.noImage} without an image, ${stats.failed} failed.`,
	);

	if (values.publish && !dryRun) await publishApproved(supabase, animeIds);
	if (stats.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
