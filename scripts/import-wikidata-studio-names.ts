import { createClient } from "@supabase/supabase-js";
import { ANIME_CATALOG_SEASON_SOURCES, type AnimeCatalogSeasonSource } from "../src/lib/anime-catalog-season.ts";
import { WIKIDATA_SPARQL_ENDPOINT } from "../src/lib/wikidata-anime-titles.ts";
import {
	type CanonicalStudioNames,
	groupWikidataStudios,
	matchStudioNames,
	normalizeStudioAlias,
	type StudioSourceCandidate,
	selectCanonicalStudioNames,
	WIKIDATA_ANIMATION_STUDIO_ITEM,
	WIKIDATA_MAL_COMPANY_PROPERTY,
	type WikidataStudioBinding,
	type WikidataStudioRecord,
} from "../src/lib/wikidata-studio-names.ts";
import { STUDIO_JA_BY_EN } from "./import-jikan-season.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";

type SourceRecord = {
	mal_id: number;
	source: AnimeCatalogSeasonSource;
	normalized_data: Record<string, unknown>;
};

type StudioSourceInsert = {
	source: "wikidata";
	source_key: string;
	source_url: string;
	source_version: string;
	name_ja: string | null;
	name_en: string;
	canonical_name_ja: string | null;
	canonical_name_en: string;
	canonical_name_source: "jikan" | "wikidata";
	aliases: string[];
	mal_company_id: number | null;
	imported_at: string;
};

type StudioAliasInsert = {
	alias_key: string;
	alias: string;
	source: "wikidata";
	source_key: string;
	match_method: "normalized_exact";
	imported_at: string;
};

type ImportDatabase = {
	public: {
		Tables: {
			anime_source_records: {
				Row: SourceRecord;
				Insert: SourceRecord;
				Update: Partial<SourceRecord>;
			};
			studio_source_records: {
				Row: StudioSourceInsert;
				Insert: StudioSourceInsert;
				Update: Partial<StudioSourceInsert>;
			};
			studio_name_aliases: {
				Row: StudioAliasInsert;
				Insert: StudioAliasInsert;
				Update: Partial<StudioAliasInsert>;
			};
		};
	};
};

type Options = { year: number; season: SeasonName; dryRun: boolean };

const VALID_SEASONS = new Set<SeasonName>(["winter", "spring", "summer", "fall"]);
const BATCH_SIZE = 100;

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
		throw new Error("Usage: pnpm import:wikidata-studios -- --year 2023 --season winter [--dry-run]");
	}
	return { year: options.year, season: options.season, dryRun: options.dryRun };
}

function getSupabaseClient() {
	const url = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const key = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!url || !key) throw new Error("Set the Supabase URL and service role key environment variables.");
	return createClient<ImportDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchSeasonSources(supabase: ReturnType<typeof getSupabaseClient>, season: string) {
	const records: SourceRecord[] = [];
	for (let start = 0; ; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("mal_id,source,normalized_data")
			.in("source", [...ANIME_CATALOG_SEASON_SOURCES])
			.filter("normalized_data->>season", "eq", season)
			.order("mal_id", { ascending: true })
			.order("source", { ascending: true })
			.range(start, start + BATCH_SIZE - 1);
		if (error) throw new Error(`Could not read ODbL/Jikan season source records: ${error.message}`);
		records.push(...((data ?? []) as SourceRecord[]));
		if (!data || data.length < BATCH_SIZE) break;
	}
	return records;
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function collectStudioCandidates(records: readonly SourceRecord[]): StudioSourceCandidate[] {
	const candidates = new Map<string, StudioSourceCandidate>();
	const add = (name: string, malCompanyId?: number | null) => {
		const aliasKey = normalizeStudioAlias(name);
		if (!aliasKey) return;
		const existing = candidates.get(aliasKey);
		if (!existing || (!existing.malCompanyId && malCompanyId)) candidates.set(aliasKey, { name, malCompanyId });
	};
	for (const record of records) {
		const data = record.normalized_data;
		for (const name of [...strings(data["studios"]), ...strings(data["studio"]), ...strings(data["studio_en"])]) {
			add(name);
		}
		if (Array.isArray(data["studio_entities"])) {
			for (const value of data["studio_entities"]) {
				if (!value || typeof value !== "object" || Array.isArray(value)) continue;
				const name = (value as Record<string, unknown>)["name"];
				const malCompanyId = (value as Record<string, unknown>)["mal_id"];
				if (typeof name === "string" && name.trim()) {
					add(name.trim(), typeof malCompanyId === "number" ? malCompanyId : null);
				}
			}
		}
	}
	return [...candidates.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchWikidataStudios(): Promise<WikidataStudioRecord[]> {
	const query = `
		SELECT ?item ?jaLabel ?enLabel ?enAlias ?malCompany WHERE {
			?item wdt:P31/wdt:P279* wd:${WIKIDATA_ANIMATION_STUDIO_ITEM}.
			?item rdfs:label ?enLabel.
			FILTER(LANG(?enLabel) = "en")
			OPTIONAL {
				?item rdfs:label ?jaLabel.
				FILTER(LANG(?jaLabel) = "ja")
			}
			OPTIONAL {
				?item skos:altLabel ?enAlias.
				FILTER(LANG(?enAlias) = "en")
			}
			OPTIONAL { ?item wdt:${WIKIDATA_MAL_COMPANY_PROPERTY} ?malCompany. }
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
	if (!response.ok) throw new Error(`Wikidata studio query failed: ${response.status} ${response.statusText}`);
	const payload = (await response.json()) as { results?: { bindings?: WikidataStudioBinding[] } };
	return groupWikidataStudios(payload.results?.bindings ?? []);
}

function buildRows(
	sourceNames: string[],
	matches: Map<string, WikidataStudioRecord>,
	canonicalNames: ReadonlyMap<string, CanonicalStudioNames>,
) {
	const importedAt = new Date().toISOString();
	const sourceVersion = importedAt.slice(0, 10);
	const matchedStudios = [...new Map([...matches.values()].map((studio) => [studio.sourceKey, studio])).values()];
	const sourceRows: StudioSourceInsert[] = matchedStudios.map((studio) => {
		const canonical = canonicalNames.get(studio.sourceKey) ?? {
			nameJa: studio.nameJa,
			nameEn: studio.nameEn,
			source: "wikidata" as const,
		};
		return {
			source: "wikidata",
			source_key: studio.sourceKey,
			source_url: studio.sourceUrl,
			source_version: sourceVersion,
			name_ja: studio.nameJa,
			name_en: studio.nameEn,
			canonical_name_ja: canonical.nameJa,
			canonical_name_en: canonical.nameEn,
			canonical_name_source: canonical.source,
			aliases: studio.aliases,
			mal_company_id: studio.malCompanyId,
			imported_at: importedAt,
		};
	});
	const aliasRowsByKey = new Map<string, StudioAliasInsert>();
	for (const alias of sourceNames) {
		const aliasKey = normalizeStudioAlias(alias);
		const studio = matches.get(aliasKey);
		if (studio && !aliasRowsByKey.has(aliasKey)) {
			aliasRowsByKey.set(aliasKey, {
				alias_key: aliasKey,
				alias,
				source: "wikidata",
				source_key: studio.sourceKey,
				match_method: "normalized_exact",
				imported_at: importedAt,
			});
		}
	}
	const aliasRows = [...aliasRowsByKey.values()];
	return { sourceRows, aliasRows };
}

async function saveRows(
	supabase: ReturnType<typeof getSupabaseClient>,
	sourceRows: StudioSourceInsert[],
	aliasRows: StudioAliasInsert[],
) {
	for (let start = 0; start < sourceRows.length; start += BATCH_SIZE) {
		const { error } = await supabase
			.from("studio_source_records")
			.upsert(sourceRows.slice(start, start + BATCH_SIZE), { onConflict: "source,source_key" });
		if (error) throw new Error(`Could not save studio source records: ${error.message}`);
	}
	for (let start = 0; start < aliasRows.length; start += BATCH_SIZE) {
		const { error } = await supabase
			.from("studio_name_aliases")
			.upsert(aliasRows.slice(start, start + BATCH_SIZE), { onConflict: "alias_key" });
		if (error) throw new Error(`Could not save studio aliases: ${error.message}`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const season = `${options.year}-${options.season}`;
	const supabase = getSupabaseClient();
	const sourceRecords = await fetchSeasonSources(supabase, season);
	const sourceCandidates = collectStudioCandidates(sourceRecords);
	const sourceNames = sourceCandidates.map((candidate) => candidate.name);
	const wikidataStudios = await fetchWikidataStudios();
	const matches = matchStudioNames(sourceCandidates, wikidataStudios);
	const matchedStudios = [...new Map([...matches.values()].map((studio) => [studio.sourceKey, studio])).values()];
	const canonicalNames = selectCanonicalStudioNames(
		matchedStudios,
		[
			{
				studio: Object.values(STUDIO_JA_BY_EN),
				studio_en: Object.keys(STUDIO_JA_BY_EN),
			},
			...sourceRecords.filter((record) => record.source === "jikan").map((record) => record.normalized_data),
		],
		matches,
	);
	const { sourceRows, aliasRows } = buildRows(sourceNames, matches, canonicalNames);
	const japaneseCount = sourceRows.filter((row) => row.canonical_name_ja).length;
	const jikanNameCount = sourceRows.filter((row) => row.canonical_name_source === "jikan").length;
	console.log(
		`Studio resolution preview for ${season}: ${sourceNames.length} source names; ${aliasRows.length} matched aliases; ${sourceRows.length} identities; ${japaneseCount} Japanese names; ${jikanNameCount} Jikan-preferred names.`,
	);
	const tezukaExample = aliasRows.find((row) => row.alias_key === "tezukaproductions");
	if (tezukaExample) {
		console.log(
			"Tezuka example:",
			JSON.stringify({
				alias: tezukaExample.alias,
				studio: sourceRows.find((row) => row.source_key === tezukaExample.source_key),
			}),
		);
	}
	console.log(
		JSON.stringify(
			aliasRows
				.slice(0, 20)
				.map((alias) => ({ ...alias, studio: sourceRows.find((row) => row.source_key === alias.source_key) })),
			null,
			2,
		),
	);
	if (options.dryRun) {
		console.log("Dry run complete. No database writes were made.");
		return;
	}
	await saveRows(supabase, sourceRows, aliasRows);
	console.log(`Saved ${sourceRows.length} studio identities and ${aliasRows.length} aliases.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
