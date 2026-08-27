import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
	ANIME_CATALOG_SEASON_SOURCES,
	type AnimeCatalogSeasonSource,
	collectAnimeCatalogSeasonMalIds,
} from "../src/lib/anime-catalog-season.ts";
import { translateAnimeSource } from "../src/lib/anime-vocabulary.ts";
import {
	fetchAniListSeasonMalIds,
	GENRE_JA_BY_EN,
	normalizeBroadcastSchedule,
	STUDIO_JA_BY_EN,
} from "./import-jikan-season.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";

// The official API (api.myanimelist.net v2) is the authoritative route to MAL
// data; Jikan serves the same content by scraping. Normalized rows mirror the
// Jikan field names so the catalog resolver can rank `mal` just above `jikan`.
// Fields MAL cannot supply (official URLs, resources, cover) are OMITTED so
// they never shadow Jikan values with null.
const MAL_API_BASE_URL = "https://api.myanimelist.net/v2";
const MAL_FIELDS = [
	"id",
	"title",
	"alternative_titles",
	"start_date",
	"end_date",
	"media_type",
	"status",
	"num_episodes",
	"average_episode_duration",
	"start_season",
	"broadcast",
	"source",
	"studios",
	"genres",
].join(",");

const REQUEST_INTERVAL_MS = 1000;
const MAX_RETRIES = 5;
const DATABASE_BATCH_SIZE = 100;
const MIN_IMPORT_COMPLETENESS_RATIO = 0.9;
const IMPORT_CHECKPOINT_DIRECTORY = join(process.cwd(), ".mal-import-cache");

const MEDIA_TYPE_LABELS: Record<string, string> = {
	tv: "TV",
	ova: "OVA",
	movie: "Movie",
	special: "Special",
	ona: "ONA",
	music: "Music",
	cm: "CM",
	pv: "PV",
	tv_special: "TV Special",
};

const STATUS_LABELS: Record<string, "airing" | "finished" | "upcoming"> = {
	finished_airing: "finished",
	currently_airing: "airing",
	not_yet_aired: "upcoming",
};

type MalAnimeNode = {
	id: number;
	title?: string;
	alternative_titles?: { synonyms?: string[]; en?: string; ja?: string };
	start_date?: string;
	end_date?: string;
	media_type?: string;
	status?: string;
	num_episodes?: number;
	average_episode_duration?: number;
	start_season?: { year?: number; season?: string };
	broadcast?: { day_of_the_week?: string; start_time?: string };
	source?: string;
	studios?: { id: number; name: string }[];
	genres?: { id: number; name: string }[];
};

type MalNormalizedData = {
	mal_id: number;
	title: string;
	season: string;
	status: "airing" | "finished" | "upcoming";
	title_ja?: string;
	title_en?: string;
	title_romaji?: string;
	episode_count?: string;
	/** 1話あたりの実尺（分）。総合ロビー自動判定のソース。 */
	episode_duration_minutes?: number;
	type?: string;
	source?: string;
	aired_from?: string;
	aired_to?: string;
	studio?: string[];
	studio_en?: string[];
	genre?: string[];
	genre_en?: string[];
	broadcast_day?: number;
	broadcast_time?: string;
};

type MalSourceRecordInsert = {
	mal_id: number;
	source: "mal";
	source_version: "v2";
	source_url: string;
	source_updated_at: null;
	normalized_data: MalNormalizedData;
	imported_at: string;
};

type SeasonSourceRow = { mal_id: number; source: AnimeCatalogSeasonSource };

type ImportDatabase = {
	public: {
		Tables: {
			anime_source_records: {
				Row: MalSourceRecordInsert & { id: number };
				Insert: MalSourceRecordInsert;
				Update: Partial<MalSourceRecordInsert>;
			};
		};
	};
};

type ImportCheckpoint = {
	version: 1;
	year: number;
	season: SeasonName;
	// null marks a MAL ID the API says does not exist (404) — resolved, not retried.
	animeByMalId: Record<string, MalAnimeNode | null>;
	failedMalIds: number[];
	updatedAt: string;
};

type Options = {
	year: number;
	season: SeasonName;
	dryRun: boolean;
};

const VALID_SEASONS = new Set<SeasonName>(["winter", "spring", "summer", "fall"]);

function parseArgs(argv: string[]): Options {
	const options: Partial<Options> & Pick<Options, "dryRun"> = { dryRun: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--year" && next) {
			options.year = Number.parseInt(next, 10);
			index += 1;
			continue;
		}
		if (arg === "--season" && next) {
			if (!VALID_SEASONS.has(next as SeasonName)) throw new Error(`Invalid season: ${next}`);
			options.season = next as SeasonName;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!Number.isInteger(options.year) || !options.year || options.year < 1900 || !options.season) {
		throw new Error("Usage: pnpm import:mal -- --year 2020 --season winter [--dry-run]");
	}
	return { year: options.year, season: options.season, dryRun: options.dryRun };
}

function getClientId(): string {
	const clientId = process.env["MAL_CLIENT_ID"];
	if (!clientId) throw new Error("Set MAL_CLIENT_ID (issued at https://myanimelist.net/apiconfig).");
	return clientId;
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient<ImportDatabase>(supabaseUrl, secretKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function importCheckpointPath(year: number, season: SeasonName) {
	return join(IMPORT_CHECKPOINT_DIRECTORY, `mal-import-${year}-${season}.json`);
}

async function loadImportCheckpoint(year: number, season: SeasonName): Promise<ImportCheckpoint> {
	const fallback: ImportCheckpoint = {
		version: 1,
		year,
		season,
		animeByMalId: {},
		failedMalIds: [],
		updatedAt: new Date().toISOString(),
	};
	try {
		const raw = await readFile(importCheckpointPath(year, season), "utf8");
		const value = JSON.parse(raw) as Partial<ImportCheckpoint>;
		if (
			value.version === 1 &&
			value.year === year &&
			value.season === season &&
			value.animeByMalId !== null &&
			typeof value.animeByMalId === "object"
		) {
			return { ...fallback, ...value } as ImportCheckpoint;
		}
	} catch {
		// Missing or unreadable checkpoint falls through to a fresh one.
	}
	return fallback;
}

async function saveImportCheckpoint(checkpoint: ImportCheckpoint) {
	await mkdir(IMPORT_CHECKPOINT_DIRECTORY, { recursive: true });
	checkpoint.updatedAt = new Date().toISOString();
	const path = importCheckpointPath(checkpoint.year, checkpoint.season);
	const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await writeFile(temporaryPath, serialized, "utf8");
	// Windows can transiently refuse rename-over-existing (EPERM) while an
	// antivirus or indexer holds the target; retry, then write in place.
	for (let attempt = 1; ; attempt += 1) {
		try {
			await rename(temporaryPath, path);
			return;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt >= 3) {
				await writeFile(path, serialized, "utf8");
				return;
			}
			await sleep(200 * attempt);
		}
	}
}

async function fetchSeasonMalIds(supabase: ReturnType<typeof getSupabaseClient>, season: string): Promise<number[]> {
	const rows: SeasonSourceRow[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("mal_id,source")
			.in("source", [...ANIME_CATALOG_SEASON_SOURCES])
			.filter("normalized_data->>season", "eq", season)
			.order("mal_id", { ascending: true })
			.order("source", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (error) throw new Error(`Could not read ODbL/Jikan season source records: ${error.message}`);
		rows.push(...((data ?? []) as SeasonSourceRow[]));
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	return collectAnimeCatalogSeasonMalIds(rows);
}

// Returns the anime node, or null when MAL reports the ID as gone (404).
async function fetchMalAnime(malId: number, clientId: string): Promise<MalAnimeNode | null> {
	const url = `${MAL_API_BASE_URL}/anime/${malId}?fields=${MAL_FIELDS}`;
	for (let attempt = 1; ; attempt += 1) {
		const response = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId } });
		if (response.ok) return (await response.json()) as MalAnimeNode;
		if (response.status === 404) return null;
		if (attempt >= MAX_RETRIES) {
			throw new Error(`MAL API failed for anime ${malId}: ${response.status} ${response.statusText}`);
		}
		const delaySeconds = Math.min(2 ** attempt, 60);
		console.warn(
			`MAL API ${response.status} for anime ${malId}; retrying in ${delaySeconds}s (${attempt}/${MAX_RETRIES})`,
		);
		await sleep(delaySeconds * 1000);
	}
}

// MAL spells some names differently from Jikan (e.g. "MADHOUSE" vs
// "Madhouse"), so dictionary lookup is case-insensitive.
function translateNames(names: string[], dictionary: Record<string, string>): string[] {
	const lowered = new Map(Object.entries(dictionary).map(([key, value]) => [key.toLowerCase(), value]));
	return names.map((name) => lowered.get(name.toLowerCase()) ?? name);
}

function fullDateOnly(value: string | undefined): string | undefined {
	return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function shiftDateOnly(value: string | undefined, offsetDays: number): string | undefined {
	if (!value || offsetDays === 0) return value;
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return value;
	date.setUTCDate(date.getUTCDate() + offsetDays);
	return date.toISOString().slice(0, 10);
}

function humanizeMalSource(source: string | undefined): string | undefined {
	if (!source) return undefined;
	const spaced = source.replaceAll("_", " ");
	const label = (spaced.charAt(0).toUpperCase() + spaced.slice(1)).replace(/^4 koma manga$/i, "4-koma manga");
	return translateAnimeSource(label) ?? label;
}

function mapMalAnime(anime: MalAnimeNode, year: number, season: SeasonName): MalNormalizedData {
	const titleJa = anime.alternative_titles?.ja?.trim() || undefined;
	const titleEn = anime.alternative_titles?.en?.trim() || undefined;
	const titleRomaji = anime.title?.trim() || undefined;
	const studioEn = [...new Set((anime.studios ?? []).map((studio) => studio.name.trim()).filter(Boolean))];
	const genreEn = [...new Set((anime.genres ?? []).map((genre) => genre.name.trim()).filter(Boolean))];
	const broadcastSchedule = normalizeBroadcastSchedule({
		day: anime.broadcast?.day_of_the_week,
		time: anime.broadcast?.start_time,
	});
	const airedFrom = shiftDateOnly(fullDateOnly(anime.start_date), broadcastSchedule.aired_date_offset_days);
	const airedTo = shiftDateOnly(fullDateOnly(anime.end_date), broadcastSchedule.aired_date_offset_days);

	const normalized: MalNormalizedData = {
		mal_id: anime.id,
		title: titleJa ?? titleRomaji ?? titleEn ?? `MAL ${anime.id}`,
		season: `${year}-${season}`,
		status: STATUS_LABELS[anime.status ?? ""] ?? "upcoming",
	};
	if (titleJa) normalized.title_ja = titleJa;
	if (titleEn) normalized.title_en = titleEn;
	if (titleRomaji) normalized.title_romaji = titleRomaji;
	if (anime.num_episodes) normalized.episode_count = String(anime.num_episodes);
	if (anime.average_episode_duration && anime.average_episode_duration > 0) {
		normalized.episode_duration_minutes = Math.round(anime.average_episode_duration / 60);
	}
	const type = MEDIA_TYPE_LABELS[anime.media_type ?? ""];
	if (type) normalized.type = type;
	const sourceLabel = humanizeMalSource(anime.source);
	if (sourceLabel) normalized.source = sourceLabel;
	if (airedFrom) normalized.aired_from = airedFrom;
	if (airedTo) normalized.aired_to = airedTo;
	if (studioEn.length > 0) {
		normalized.studio_en = studioEn;
		normalized.studio = translateNames(studioEn, STUDIO_JA_BY_EN);
	}
	if (genreEn.length > 0) {
		normalized.genre_en = genreEn;
		normalized.genre = translateNames(genreEn, GENRE_JA_BY_EN);
	}
	if (broadcastSchedule.broadcast_day !== null) normalized.broadcast_day = broadcastSchedule.broadcast_day;
	if (broadcastSchedule.broadcast_time !== null) normalized.broadcast_time = broadcastSchedule.broadcast_time;
	return normalized;
}

function buildSourceRows(
	animeByMalId: Record<string, MalAnimeNode | null>,
	malIds: number[],
	year: number,
	season: SeasonName,
): MalSourceRecordInsert[] {
	const importedAt = new Date().toISOString();
	return malIds.flatMap((malId) => {
		const anime = animeByMalId[String(malId)];
		if (!anime) return [];
		return [
			{
				mal_id: malId,
				source: "mal" as const,
				source_version: "v2" as const,
				source_url: `https://myanimelist.net/anime/${malId}`,
				source_updated_at: null,
				normalized_data: mapMalAnime(anime, year, season),
				imported_at: importedAt,
			},
		];
	});
}

async function saveSourceRows(supabase: ReturnType<typeof getSupabaseClient>, rows: MalSourceRecordInsert[]) {
	for (let start = 0; start < rows.length; start += DATABASE_BATCH_SIZE) {
		const batch = rows.slice(start, start + DATABASE_BATCH_SIZE);
		const { error } = await supabase.from("anime_source_records").upsert(batch, { onConflict: "mal_id,source" });
		if (error) throw new Error(`Could not save MAL source records: ${error.message}`);
		console.log(`Saved ${Math.min(start + batch.length, rows.length)}/${rows.length} MAL source records.`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const clientId = getClientId();
	const season = `${options.year}-${options.season}`;
	const supabase = getSupabaseClient();

	const storedMalIds = await fetchSeasonMalIds(supabase, season);
	// 公開Jikanが長期停止しても新規作品の発見が止まらないよう、AniListの
	// シーズン一覧も対象IDへ合流させる（詳細はMAL公式APIから取るのでJikan不要）。
	// AniList障害時は既存レコード由来のIDだけで続行する。
	let aniListMalIds: number[] = [];
	try {
		aniListMalIds = await fetchAniListSeasonMalIds(options.year, options.season);
	} catch (error) {
		console.warn(
			`AniList season id fetch failed; continuing with stored ids only: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const malIds = [...new Set([...storedMalIds, ...aniListMalIds])].sort((left, right) => left - right);
	if (malIds.length === 0) throw new Error(`No season MAL ids found for ${season} (stored records or AniList).`);
	console.log(
		`Target MAL IDs for ${season}: ${malIds.length} (stored: ${storedMalIds.length}, AniList: ${aniListMalIds.length})`,
	);

	const checkpoint = await loadImportCheckpoint(options.year, options.season);
	const pendingMalIds = malIds.filter((malId) => checkpoint.animeByMalId[String(malId)] === undefined);
	const resumedCount = malIds.length - pendingMalIds.length;
	if (resumedCount > 0) console.log(`Resuming from checkpoint with ${resumedCount}/${malIds.length} cached.`);

	for (const [index, malId] of pendingMalIds.entries()) {
		console.log(`Fetching MAL anime ${index + 1}/${pendingMalIds.length}: ${malId}`);
		let anime: MalAnimeNode | null;
		try {
			anime = await fetchMalAnime(malId, clientId);
		} catch (error) {
			checkpoint.failedMalIds = malIds.filter(
				(expected) => checkpoint.animeByMalId[String(expected)] === undefined,
			);
			await saveImportCheckpoint(checkpoint);
			throw error;
		}
		if (anime === null) console.warn(`MAL anime ${malId} does not exist (404); recording as missing.`);
		checkpoint.animeByMalId[String(malId)] = anime;
		checkpoint.failedMalIds = malIds.filter((expected) => checkpoint.animeByMalId[String(expected)] === undefined);
		if ((index + 1) % 10 === 0 || index === pendingMalIds.length - 1) {
			await saveImportCheckpoint(checkpoint);
		}
		await sleep(REQUEST_INTERVAL_MS);
	}

	const resolvedCount = malIds.filter((malId) => checkpoint.animeByMalId[String(malId)] !== undefined).length;
	const completeness = resolvedCount / malIds.length;
	if (completeness < MIN_IMPORT_COMPLETENESS_RATIO) {
		throw new Error(
			`Import completeness ${(completeness * 100).toFixed(1)}% is below the ${MIN_IMPORT_COMPLETENESS_RATIO * 100}% safety threshold; aborting without database writes.`,
		);
	}

	const rows = buildSourceRows(checkpoint.animeByMalId, malIds, options.year, options.season);
	const missingCount = malIds.length - rows.length;
	console.log(`Mapped ${rows.length} MAL records (${missingCount} missing on MAL).`);
	const jaCount = rows.filter((row) => row.normalized_data.title_ja).length;
	console.log(`Japanese titles: ${jaCount}/${rows.length}`);

	if (options.dryRun) {
		console.log(JSON.stringify(rows.slice(0, 3), null, 2));
		console.log("Dry run complete. No database writes were made.");
		return;
	}

	await saveSourceRows(supabase, rows);
	// 全対象IDの取得が完了した時点でのみここへ到達する（途中エラーは即throw）ため、
	// 今回の結果に無い既存の mal レコード（404になったID・対象リストから外れたID）を
	// このシーズンから削除して整合させる。残すと resolver が古い高優先度ソースを
	// 採用し続ける。
	{
		const seasonValue = `${options.year}-${options.season}`;
		const keepIds = rows.map((row) => row.mal_id);
		// biome-ignore lint/suspicious/noExplicitAny: jsonb path filter is not covered by the local ImportDatabase type
		let staleQuery = (supabase.from("anime_source_records") as any)
			.delete()
			.eq("source", "mal")
			.eq("normalized_data->>season", seasonValue);
		if (keepIds.length > 0) staleQuery = staleQuery.not("mal_id", "in", `(${keepIds.join(",")})`);
		const { data: staleRows, error: staleError } = await staleQuery.select("mal_id");
		if (staleError) {
			throw new Error(`Could not reconcile stale MAL records for ${seasonValue}: ${staleError.message}`);
		}
		const staleIds = ((staleRows ?? []) as { mal_id: number }[]).map((row) => row.mal_id);
		if (staleIds.length > 0) {
			console.warn(`Removed ${staleIds.length} stale MAL records for ${seasonValue}: ${staleIds.join(", ")}`);
		}
	}
	// Clear the checkpoint so a future re-run refreshes from the live API
	// instead of replaying this run's cached snapshots.
	try {
		await unlink(importCheckpointPath(options.year, options.season));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	console.log("Source import complete. Run the catalog resolver to publish the resolved fields.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
