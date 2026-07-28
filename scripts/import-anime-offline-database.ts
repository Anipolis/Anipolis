import { createClient } from "@supabase/supabase-js";
import {
	type AnimeOfflineEntry,
	type AnimeOfflineSeason,
	getMalIdFromSources,
	isAnimeOfflineDataset,
	mapAnimeOfflineStatus,
	mapAnimeOfflineType,
	mergeAnimeOfflineSource,
	pinLatestGithubReleaseAssetUrl,
} from "../src/lib/anime-offline-database.ts";

type AnimeResourceLink = {
	name: string;
	url: string;
};

type AnimeImportRow = {
	mal_id: number;
	title: string;
	title_romaji: string | null;
	episode_count: string | null;
	type: string | null;
	status: "airing" | "finished" | "upcoming";
	season: string;
	studio: string[];
	studio_en: string[];
	resources: AnimeResourceLink[];
};

type ImportDatabase = {
	public: {
		Tables: {
			anime: {
				Insert: AnimeImportRow;
				Update: Partial<AnimeImportRow>;
				Row: AnimeImportRow;
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
		title_romaji: title,
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

function preferExistingString(previous: string | null, next: string | null): string | null {
	return previous?.trim() ? previous : next;
}

function preferExistingList(previous: string[] | null, next: string[]): string[] {
	return previous && previous.length > 0 ? previous : next;
}

function mergeExistingRow(row: AnimeImportRow, existing: AnimeImportRow | undefined): AnimeImportRow {
	if (!existing) return row;

	return {
		...row,
		title: existing.title.trim() || row.title,
		title_romaji: preferExistingString(existing.title_romaji, row.title_romaji),
		episode_count: preferExistingString(existing.episode_count, row.episode_count),
		type: preferExistingString(existing.type, row.type),
		status: existing.status,
		studio: preferExistingList(existing.studio, row.studio),
		studio_en: preferExistingList(existing.studio_en, row.studio_en),
		resources: mergeAnimeOfflineSource(existing.resources ?? [], row.resources[0]?.url ?? ""),
	};
}

async function upsertRows(rows: AnimeImportRow[]) {
	const supabase = getSupabaseClient();
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
		const batch = sourceBatch.map((row) => mergeExistingRow(row, existingByMalId.get(row.mal_id)));
		const { error: writeError } = await supabase.from("anime").upsert(batch, { onConflict: "mal_id" });

		if (writeError) throw new Error(`Supabase upsert failed: ${writeError.message}`);

		saved += batch.length;
		console.log(`Supabase upserted ${saved}/${rows.length} rows.`);
	}
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

	console.log(`Dataset release asset: ${resolvedUrl}`);
	console.log(`Dataset last update: ${dataset.lastUpdate}`);
	console.log(`Matched ${seasonEntries.length} seasonal entries; mapped ${rows.length} entries with MAL IDs.`);

	if (rows.length === 0) {
		throw new Error(`No importable entries found for ${options.year} ${options.season}.`);
	}

	if (options.dryRun) {
		console.log(JSON.stringify(rows.slice(0, 3), null, 2));
		console.log("Dry run complete. No database writes were made.");
		return;
	}

	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	getSupabaseClient();
	console.log(`Writing to Supabase: ${new URL(supabaseUrl ?? "").host}`);
	await upsertRows(rows);
	console.log(`Import complete: ${rows.length} rows processed.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
