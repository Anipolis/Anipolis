import { createClient } from "@supabase/supabase-js";
import {
	ANIME_CATALOG_SEASON_SOURCES,
	type AnimeCatalogSeasonSource,
	collectAnimeCatalogSeasonMalIds,
} from "../src/lib/anime-catalog-season.ts";
import {
	groupWikidataJapaneseTitles,
	toWikidataPageUrl,
	WIKIDATA_PROPERTY_MAL_ANIME_ID_URL,
	WIKIDATA_SOURCE_NAME,
	WIKIDATA_SPARQL_ENDPOINT,
	type WikidataBinding,
} from "../src/lib/wikidata-anime-titles.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";

type AnimeSeasonSourceData = {
	mal_id: number;
	title: string;
	season: string;
};

type AnimeSourceRecordRow = {
	mal_id: number;
	source: AnimeCatalogSeasonSource | "wikidata";
	normalized_data: AnimeSeasonSourceData;
};

type AnimeSeasonSourceRow = Pick<AnimeSourceRecordRow, "mal_id" | "source">;

type WikidataNormalizedData = {
	mal_id: number;
	title_ja: string | null;
	title_ja_candidates: string[];
	title_en: string | null;
	title_en_candidates: string[];
	title_en_aliases: string[];
	language: "ja";
	item_urls: string[];
};

type WikidataSourceRecordInsert = {
	mal_id: number;
	source: "wikidata";
	source_version: string;
	source_url: string;
	source_updated_at: string | null;
	normalized_data: WikidataNormalizedData;
	imported_at: string;
};

type ImportDatabase = {
	public: {
		Tables: {
			anime_source_records: {
				Row: AnimeSourceRecordRow;
				Insert: WikidataSourceRecordInsert;
				Update: Partial<WikidataSourceRecordInsert>;
			};
		};
	};
};

type Options = {
	year: number;
	season: SeasonName;
	dryRun: boolean;
};

const VALID_SEASONS = new Set<SeasonName>(["winter", "spring", "summer", "fall"]);
const DATABASE_BATCH_SIZE = 100;
const WIKIDATA_BATCH_SIZE = 100;

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
		throw new Error("Usage: pnpm import:wikidata-titles -- --year 2023 --season winter [--dry-run]");
	}

	return { year: options.year, season: options.season, dryRun: options.dryRun };
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

async function fetchAnimeSeasonSourceRows(
	supabase: ReturnType<typeof getSupabaseClient>,
	season: string,
): Promise<AnimeSeasonSourceRow[]> {
	const rows: AnimeSeasonSourceRow[] = [];
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
		rows.push(...((data ?? []) as AnimeSeasonSourceRow[]));
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	return rows;
}

async function fetchWikidataBindings(malIds: number[]): Promise<WikidataBinding[]> {
	const bindings: WikidataBinding[] = [];
	for (let start = 0; start < malIds.length; start += WIKIDATA_BATCH_SIZE) {
		const batch = malIds.slice(start, start + WIKIDATA_BATCH_SIZE);
		const values = batch.map((malId) => `"${malId}"`).join(" ");
		const query = `
			SELECT ?mal ?item ?jaLabel ?enLabel ?enAlias WHERE {
				VALUES ?mal { ${values} }
				?item wdt:P4086 ?mal.
				?item rdfs:label ?jaLabel.
				FILTER(LANG(?jaLabel) = "ja")
				OPTIONAL {
					?item rdfs:label ?enLabel.
					FILTER(LANG(?enLabel) = "en")
				}
				OPTIONAL {
					?item skos:altLabel ?enAlias.
					FILTER(LANG(?enAlias) = "en")
				}
			}
		`;
		const url = new URL(WIKIDATA_SPARQL_ENDPOINT);
		url.searchParams.set("query", query);
		url.searchParams.set("format", "json");
		const response = await fetch(url, {
			headers: {
				Accept: "application/sparql-results+json",
				"User-Agent": "Anipolis/1.0 (https://github.com/Anipolis/Anipolis)",
			},
		});
		if (!response.ok) throw new Error(`Wikidata query failed: ${response.status} ${response.statusText}`);
		const payload = (await response.json()) as { results?: { bindings?: WikidataBinding[] } };
		bindings.push(...(payload.results?.bindings ?? []));
		console.log(`Wikidata queried ${Math.min(start + batch.length, malIds.length)}/${malIds.length} MAL IDs.`);
		await sleep(250);
	}
	return bindings;
}

function buildSourceRows(records: ReturnType<typeof groupWikidataJapaneseTitles>): WikidataSourceRecordInsert[] {
	const importedAt = new Date().toISOString();
	const sourceVersion = importedAt.slice(0, 10);
	return records.map((record) => ({
		mal_id: record.malId,
		source: WIKIDATA_SOURCE_NAME,
		source_version: sourceVersion,
		source_url: toWikidataPageUrl(record.itemUrls[0] ?? WIKIDATA_PROPERTY_MAL_ANIME_ID_URL),
		source_updated_at: null,
		normalized_data: {
			mal_id: record.malId,
			title_ja: record.titleJa,
			title_ja_candidates: record.titleJaCandidates,
			title_en: record.titleEn,
			title_en_candidates: record.titleEnCandidates,
			title_en_aliases: record.titleEnAliases,
			language: "ja",
			item_urls: record.itemUrls.map(toWikidataPageUrl),
		},
		imported_at: importedAt,
	}));
}

async function saveSourceRows(supabase: ReturnType<typeof getSupabaseClient>, rows: WikidataSourceRecordInsert[]) {
	for (let start = 0; start < rows.length; start += DATABASE_BATCH_SIZE) {
		const batch = rows.slice(start, start + DATABASE_BATCH_SIZE);
		const { error } = await supabase.from("anime_source_records").upsert(batch, { onConflict: "mal_id,source" });
		if (error) throw new Error(`Could not save Wikidata source records: ${error.message}`);
	}
	console.log(`Saved ${rows.length} Wikidata source records.`);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const season = `${options.year}-${options.season}`;
	const supabase = getSupabaseClient();
	const seasonSourceRows = await fetchAnimeSeasonSourceRows(supabase, season);
	if (seasonSourceRows.length === 0) throw new Error(`No ODbL or Jikan source records found for ${season}.`);
	const malIds = collectAnimeCatalogSeasonMalIds(seasonSourceRows);

	const bindings = await fetchWikidataBindings(malIds);
	const records = groupWikidataJapaneseTitles(bindings);
	const sourceRows = buildSourceRows(records);
	const conflicts = sourceRows.filter((row) => row.normalized_data.title_ja === null);
	console.log(
		`Wikidata coverage: ${sourceRows.length}/${malIds.length}; ${conflicts.length} records have conflicting Japanese labels.`,
	);

	if (options.dryRun) {
		console.log(JSON.stringify(sourceRows.slice(0, 10), null, 2));
		console.log("Dry run complete. No database writes were made.");
		return;
	}

	await saveSourceRows(supabase, sourceRows);
	console.log("Source import complete. Run the catalog resolver to publish the resolved titles.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
