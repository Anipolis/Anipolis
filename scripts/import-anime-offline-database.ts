import { createClient } from "@supabase/supabase-js";
import {
	type AnimeOfflineCanonicalRow,
	type AnimeOfflineEntry,
	type AnimeOfflineSeason,
	getGithubReleaseVersion,
	getMalIdFromSources,
	isAnimeOfflineDataset,
	mapAnimeOfflineStatus,
	mapAnimeOfflineType,
	mergeAnimeOfflineCanonicalRow,
	mergeAnimeOfflineSource,
	pinLatestGithubReleaseAssetUrl,
} from "../src/lib/anime-offline-database.ts";
import { getKanaTitleCandidates } from "../src/lib/wikidata-anime-titles.ts";

type AnimeImportRow = AnimeOfflineCanonicalRow;

type AnimeOfflineNormalizedData = {
	mal_id: number;
	title: string;
	title_language: null;
	episode_count: string | null;
	type: string | null;
	status: "airing" | "finished" | "upcoming";
	season: string;
	studios: string[];
	title_ja_candidates: string[];
	title_ja_candidates_basis: "contains_kana_unverified";
};

type AnimeSourceRecordInsert = {
	mal_id: number;
	source: "anime_offline_database";
	source_version: string;
	source_url: string;
	source_updated_at: string | null;
	normalized_data: AnimeOfflineNormalizedData;
	imported_at: string;
};

type ImportDatabase = {
	public: {
		Tables: {
			anime: {
				Insert: AnimeImportRow;
				Update: Partial<AnimeImportRow>;
				Row: AnimeImportRow;
			};
			anime_source_records: {
				Insert: AnimeSourceRecordInsert;
				Update: Partial<AnimeSourceRecordInsert>;
				Row: AnimeSourceRecordInsert & { id: number };
			};
		};
	};
};

type ImportOptions = {
	year: number;
	season: AnimeOfflineSeason;
	dryRun: boolean;
	datasetUrl: string;
};

const DEFAULT_DATASET_URL =
	"https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json";
const VALID_SEASONS = new Set<AnimeOfflineSeason>(["winter", "spring", "summer", "fall"]);
const UPSERT_BATCH_SIZE = 100;

function parseArgs(argv: string[]): ImportOptions {
	const options: Partial<ImportOptions> & Pick<ImportOptions, "dryRun" | "datasetUrl"> = {
		dryRun: false,
		datasetUrl: DEFAULT_DATASET_URL,
	};

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
			if (!VALID_SEASONS.has(next as AnimeOfflineSeason)) throw new Error(`Invalid season: ${next}`);
			options.season = next as AnimeOfflineSeason;
			index += 1;
			continue;
		}
		if (arg === "--dataset-url" && next) {
			const datasetUrl = new URL(next);
			if (!new Set(["http:", "https:"]).has(datasetUrl.protocol)) {
				throw new Error("--dataset-url must use HTTP or HTTPS.");
			}
			options.datasetUrl = datasetUrl.toString();
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!Number.isInteger(options.year) || !options.year || options.year < 1900 || !options.season) {
		throw new Error(
			"Usage: pnpm import:anime-offline -- --year 2023 --season winter [--dry-run] [--dataset-url URL]",
		);
	}

	return {
		year: options.year,
		season: options.season,
		dryRun: options.dryRun,
		datasetUrl: options.datasetUrl,
	};
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];

	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before running the importer.",
		);
	}

	return createClient<ImportDatabase>(supabaseUrl, secretKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

async function resolveStableDatasetUrl(datasetUrl: string): Promise<string> {
	const parsedDatasetUrl = new URL(datasetUrl);
	if (parsedDatasetUrl.hostname !== "github.com") return datasetUrl;

	const latestAssetMatch = parsedDatasetUrl.pathname.match(
		/^(\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/latest\/download\/[^/]+$/,
	);
	if (!latestAssetMatch?.[1]) return datasetUrl;

	const latestReleaseUrl = `https://github.com${latestAssetMatch[1]}/releases/latest`;
	const releaseResponse = await fetch(latestReleaseUrl, {
		method: "HEAD",
		redirect: "follow",
		headers: { "User-Agent": "Anipolis anime-offline-database importer" },
	});
	if (!releaseResponse.ok) {
		throw new Error(`Could not resolve the latest dataset release: ${releaseResponse.status}`);
	}

	return pinLatestGithubReleaseAssetUrl(datasetUrl, releaseResponse.url);
}

async function fetchDataset(datasetUrl: string) {
	const stableDatasetUrl = await resolveStableDatasetUrl(datasetUrl);
	console.log(`Downloading anime-offline-database: ${stableDatasetUrl}`);
	const response = await fetch(stableDatasetUrl, {
		headers: {
			Accept: "application/json",
			"User-Agent": "Anipolis anime-offline-database importer",
		},
		redirect: "follow",
	});

	if (!response.ok) {
		throw new Error(`Dataset download failed: ${response.status} ${response.statusText}`);
	}

	const payload: unknown = await response.json();
	if (!isAnimeOfflineDataset(payload)) {
		throw new Error("The downloaded file is not a supported anime-offline-database dataset.");
	}

	return { dataset: payload, resolvedUrl: stableDatasetUrl };
}

function normalizeStringList(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return [
		...new Set(
			values
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	];
}

function mapEntry(
	entry: AnimeOfflineEntry,
	year: number,
	season: AnimeOfflineSeason,
	resolvedUrl: string,
): AnimeImportRow | null {
	const malId = getMalIdFromSources(entry.sources);
	const title = entry.title.trim();
	if (!malId || !title) return null;

	const studios = normalizeStringList(entry.studios);
	return {
		mal_id: malId,
		title,
		title_romaji: null,
		episode_count: Number.isInteger(entry.episodes) && entry.episodes > 0 ? String(entry.episodes) : null,
		type: mapAnimeOfflineType(entry.type),
		status: mapAnimeOfflineStatus(entry.status),
		season: `${year}-${season}`,
		studio: studios,
		studio_en: studios,
		resources: mergeAnimeOfflineSource([], resolvedUrl),
	};
}

function dedupeRows(rows: AnimeImportRow[]): AnimeImportRow[] {
	return [...new Map(rows.map((row) => [row.mal_id, row])).values()];
}

function toNormalizedSourceData(row: AnimeImportRow, titleJaCandidates: string[]): AnimeOfflineNormalizedData {
	return {
		mal_id: row.mal_id,
		title: row.title,
		title_language: null,
		episode_count: row.episode_count,
		type: row.type,
		status: row.status,
		season: row.season,
		studios: row.studio_en,
		title_ja_candidates: titleJaCandidates,
		title_ja_candidates_basis: "contains_kana_unverified",
	};
}

function buildTitleCandidatesByMalId(entries: AnimeOfflineEntry[]): Map<number, string[]> {
	const candidatesByMalId = new Map<number, string[]>();
	for (const entry of entries) {
		const malId = getMalIdFromSources(entry.sources);
		if (!malId) continue;
		const candidates = getKanaTitleCandidates(entry.synonyms ?? []);
		const previous = candidatesByMalId.get(malId) ?? [];
		candidatesByMalId.set(malId, [...new Set([...previous, ...candidates])]);
	}
	return candidatesByMalId;
}

function buildSourceRecordRows(
	rows: AnimeImportRow[],
	resolvedUrl: string,
	sourceUpdatedAt: string,
	titleCandidatesByMalId: Map<number, string[]>,
): AnimeSourceRecordInsert[] {
	const importedAt = new Date().toISOString();
	const sourceVersion = getGithubReleaseVersion(resolvedUrl);
	return rows.map((row) => ({
		mal_id: row.mal_id,
		source: "anime_offline_database",
		source_version: sourceVersion,
		source_url: resolvedUrl,
		source_updated_at: sourceUpdatedAt || null,
		normalized_data: toNormalizedSourceData(row, titleCandidatesByMalId.get(row.mal_id) ?? []),
		imported_at: importedAt,
	}));
}

async function upsertSourceRecords(supabase: ReturnType<typeof getSupabaseClient>, rows: AnimeSourceRecordInsert[]) {
	let saved = 0;
	for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
		const batch = rows.slice(start, start + UPSERT_BATCH_SIZE);
		const { error } = await supabase.from("anime_source_records").upsert(batch, { onConflict: "mal_id,source" });
		if (error) throw new Error(`Could not save ODbL source records: ${error.message}`);
		saved += batch.length;
		console.log(`Saved ${saved}/${rows.length} ODbL source records.`);
	}
}

async function upsertRows(supabase: ReturnType<typeof getSupabaseClient>, rows: AnimeImportRow[]) {
	let saved = 0;

	for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
		const sourceBatch = rows.slice(start, start + UPSERT_BATCH_SIZE);
		const malIds = sourceBatch.map((row) => row.mal_id);
		const { data: existingData, error: readError } = await supabase
			.from("anime")
			.select("mal_id,title,title_romaji,episode_count,type,status,season,studio,studio_en,resources")
			.in("mal_id", malIds);

		if (readError) throw new Error(`Could not read existing anime: ${readError.message}`);

		const existingByMalId = new Map(((existingData ?? []) as AnimeImportRow[]).map((row) => [row.mal_id, row]));
		const batch = sourceBatch.map((row) => mergeAnimeOfflineCanonicalRow(row, existingByMalId.get(row.mal_id)));
		const { error: writeError } = await supabase.from("anime").upsert(batch, { onConflict: "mal_id" });

		if (writeError) throw new Error(`Supabase upsert failed: ${writeError.message}`);

		saved += batch.length;
		console.log(`Supabase upserted ${saved}/${rows.length} rows.`);
	}
}

function printFormatInspection(rows: AnimeImportRow[], titleCandidatesByMalId: Map<number, string[]>) {
	const hasJapaneseScript = (value: string) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
	const japaneseTitleCount = rows.filter((row) => hasJapaneseScript(row.title)).length;
	const studios = rows.flatMap((row) => row.studio_en);
	const lowercaseStudioCount = studios.filter((studio) => studio === studio.toLowerCase()).length;

	console.log(
		`Title format: ${japaneseTitleCount}/${rows.length} contain Japanese script; ${rows.length - japaneseTitleCount}/${rows.length} do not.`,
	);
	console.log(
		`Studio format: ${lowercaseStudioCount}/${studios.length} values are entirely lowercase (${studios.length} total values).`,
	);
	const candidateRecords = [...titleCandidatesByMalId.values()].filter((candidates) => candidates.length > 0);
	console.log(
		`Kana title candidates: ${candidateRecords.length}/${rows.length} records; ${candidateRecords.filter((candidates) => candidates.length > 1).length} have multiple candidates.`,
	);
	console.log(
		`Title samples: ${rows
			.slice(0, 10)
			.map((row) => row.title)
			.join(" | ")}`,
	);
	const representativeRows = rows.filter((row) => row.type === "TV" && Number(row.episode_count) > 1).slice(0, 10);
	console.log(
		`Multi-episode TV samples: ${representativeRows.map((row) => `${row.mal_id}:${row.title}`).join(" | ")}`,
	);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const { dataset, resolvedUrl } = await fetchDataset(options.datasetUrl);
	const requestedSeason = options.season.toUpperCase();
	const seasonEntries = dataset.data.filter(
		(entry) =>
			entry.animeSeason?.year === options.year && entry.animeSeason.season?.toUpperCase() === requestedSeason,
	);
	const rows = dedupeRows(
		seasonEntries.flatMap((entry) => {
			const row = mapEntry(entry, options.year, options.season, resolvedUrl);
			return row ? [row] : [];
		}),
	);
	const titleCandidatesByMalId = buildTitleCandidatesByMalId(seasonEntries);

	console.log(`Dataset release asset: ${resolvedUrl}`);
	console.log(`Dataset last update: ${dataset.lastUpdate}`);
	console.log(`Matched ${seasonEntries.length} seasonal entries; mapped ${rows.length} entries with MAL IDs.`);
	printFormatInspection(rows, titleCandidatesByMalId);

	if (rows.length === 0) {
		throw new Error(`No importable entries found for ${options.year} ${options.season}.`);
	}
	const sourceRecordRows = buildSourceRecordRows(rows, resolvedUrl, dataset.lastUpdate, titleCandidatesByMalId);

	if (options.dryRun) {
		console.log(JSON.stringify(sourceRecordRows.slice(0, 3), null, 2));
		console.log("Dry run complete. No database writes were made.");
		return;
	}

	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const supabase = getSupabaseClient();
	console.log(`Writing to Supabase: ${new URL(supabaseUrl ?? "").host}`);
	await upsertSourceRecords(supabase, sourceRecordRows);
	await upsertRows(supabase, rows);
	console.log(`Import complete: ${rows.length} rows processed.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
