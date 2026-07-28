import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
	type AnimeCatalogCanonicalRow,
	type AnimeCatalogResolution,
	type CatalogSourceRecord,
	type LegacyAnimeCatalogRow,
	resolveAnimeCatalog,
} from "../src/lib/anime-catalog-resolver.ts";
import {
	ANIME_CATALOG_SEASON_SOURCES,
	type AnimeCatalogSeasonSource,
	collectAnimeCatalogSeasonMalIds,
} from "../src/lib/anime-catalog-season.ts";
import { normalizeStudioAlias, type StudioNameMapping } from "../src/lib/wikidata-studio-names.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";

type SourceRecordRow = CatalogSourceRecord & {
	id: number;
	source_version: string;
	imported_at: string;
};

type SeasonSourceRecordRow = {
	mal_id: number;
	source: AnimeCatalogSeasonSource;
};

type ResolutionRecordInsert = {
	mal_id: number;
	resolved_data: AnimeCatalogCanonicalRow;
	field_sources: AnimeCatalogResolution["fieldSources"];
	resolution_status: AnimeCatalogResolution["resolutionStatus"];
	resolution_reasons: string[];
	resolved_at: string;
};

type AnimeRelationRow = {
	anime_mal_id: number;
	related_anime_mal_id: number;
	relation_type: string;
	related_title: string;
};

type StudioAliasRow = {
	alias_key: string;
	source: "wikidata";
	source_key: string;
};

type StudioSourceRow = {
	source: "wikidata";
	source_key: string;
	name_ja: string | null;
	name_en: string;
	canonical_name_ja: string | null;
	canonical_name_en: string;
	source_url: string;
};

type ResolverDatabase = {
	public: {
		Tables: {
			anime_source_records: {
				Row: SourceRecordRow;
				Insert: SourceRecordRow;
				Update: Partial<SourceRecordRow>;
			};
			anime: {
				Row: LegacyAnimeCatalogRow & { id: number };
				Insert: AnimeCatalogCanonicalRow;
				Update: Partial<AnimeCatalogCanonicalRow>;
			};
			anime_resolution_records: {
				Row: ResolutionRecordInsert;
				Insert: ResolutionRecordInsert;
				Update: Partial<ResolutionRecordInsert>;
			};
			anime_relations: {
				Row: AnimeRelationRow;
				Insert: AnimeRelationRow;
				Update: Partial<AnimeRelationRow>;
			};
			studio_name_aliases: {
				Row: StudioAliasRow;
				Insert: StudioAliasRow;
				Update: Partial<StudioAliasRow>;
			};
			studio_source_records: {
				Row: StudioSourceRow;
				Insert: StudioSourceRow;
				Update: Partial<StudioSourceRow>;
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
const BATCH_SIZE = 100;
const LEGACY_COLUMNS = [
	"mal_id",
	"title",
	"title_en",
	"title_romaji",
	"episode_count",
	"type",
	"status",
	"aired_from",
	"aired_to",
	"season",
	"source",
	"studio",
	"studio_en",
	"genre",
	"genre_en",
	"broadcast_day",
	"broadcast_time",
	"official_site_url",
	"official_x_url",
	"resources",
	"cover_url",
	"metadata_ready",
].join(",");

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
		throw new Error("Usage: pnpm resolve:anime-catalog -- --year 2023 --season winter [--dry-run]");
	}
	return { year: options.year, season: options.season, dryRun: options.dryRun };
}

function getSupabaseClient() {
	const url = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const key = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!url || !key) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient<ResolverDatabase>(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

async function fetchSeasonSourceRecords(
	supabase: ReturnType<typeof getSupabaseClient>,
	season: string,
): Promise<SeasonSourceRecordRow[]> {
	const rows: SeasonSourceRecordRow[] = [];
	for (let start = 0; ; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("mal_id,source")
			.in("source", [...ANIME_CATALOG_SEASON_SOURCES])
			.filter("normalized_data->>season", "eq", season)
			.order("mal_id", { ascending: true })
			.order("source", { ascending: true })
			.range(start, start + BATCH_SIZE - 1);
		if (error) throw new Error(`Could not read ODbL/Jikan season source records: ${error.message}`);
		rows.push(...((data ?? []) as SeasonSourceRecordRow[]));
		if (!data || data.length < BATCH_SIZE) break;
	}
	return rows;
}

async function fetchAllSourceRecords(
	supabase: ReturnType<typeof getSupabaseClient>,
	malIds: number[],
): Promise<SourceRecordRow[]> {
	const rows: SourceRecordRow[] = [];
	for (let start = 0; start < malIds.length; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("id,mal_id,source,source_version,source_url,normalized_data,imported_at")
			.in("mal_id", malIds.slice(start, start + BATCH_SIZE));
		if (error) throw new Error(`Could not read source records: ${error.message}`);
		rows.push(...((data ?? []) as SourceRecordRow[]));
	}
	return rows;
}

async function fetchLegacyRows(
	supabase: ReturnType<typeof getSupabaseClient>,
	malIds: number[],
): Promise<LegacyAnimeCatalogRow[]> {
	const rows: LegacyAnimeCatalogRow[] = [];
	for (let start = 0; start < malIds.length; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select(LEGACY_COLUMNS)
			.in("mal_id", malIds.slice(start, start + BATCH_SIZE));
		if (error) throw new Error(`Could not read legacy anime rows: ${error.message}`);
		rows.push(...((data ?? []) as unknown as LegacyAnimeCatalogRow[]));
	}
	return rows;
}

function studioStrings(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function collectStudioAliasKeys(
	sourceRecords: readonly SourceRecordRow[],
	legacyRows: readonly LegacyAnimeCatalogRow[],
): string[] {
	const keys = new Set<string>();
	const add = (name: string) => {
		const key = normalizeStudioAlias(name);
		if (key) keys.add(key);
	};
	for (const row of legacyRows) {
		for (const name of [...(row.studio ?? []), ...(row.studio_en ?? [])]) add(name);
	}
	for (const source of sourceRecords) {
		const data =
			source.normalized_data !== null && typeof source.normalized_data === "object"
				? (source.normalized_data as Record<string, unknown>)
				: {};
		for (const name of [
			...studioStrings(data["studios"]),
			...studioStrings(data["studio"]),
			...studioStrings(data["studio_en"]),
		]) {
			add(name);
		}
	}
	return [...keys];
}

async function fetchStudioMappings(
	supabase: ReturnType<typeof getSupabaseClient>,
	sourceRecords: readonly SourceRecordRow[],
	legacyRows: readonly LegacyAnimeCatalogRow[],
): Promise<Map<string, StudioNameMapping>> {
	const aliasKeys = collectStudioAliasKeys(sourceRecords, legacyRows);
	const aliases: StudioAliasRow[] = [];
	for (let start = 0; start < aliasKeys.length; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("studio_name_aliases")
			.select("alias_key,source,source_key")
			.in("alias_key", aliasKeys.slice(start, start + BATCH_SIZE));
		if (error) {
			if (error.code === "42P01" || error.code === "PGRST205") {
				console.warn("Studio name tables are not available yet; continuing without localized studio mappings.");
				return new Map();
			}
			throw new Error(`Could not read studio aliases: ${error.message}`);
		}
		aliases.push(...((data ?? []) as StudioAliasRow[]));
	}
	const sourceKeys = [...new Set(aliases.map((alias) => alias.source_key))];
	const studios: StudioSourceRow[] = [];
	for (let start = 0; start < sourceKeys.length; start += BATCH_SIZE) {
		const { data, error } = await supabase
			.from("studio_source_records")
			.select("source,source_key,name_ja,name_en,canonical_name_ja,canonical_name_en,source_url")
			.eq("source", "wikidata")
			.in("source_key", sourceKeys.slice(start, start + BATCH_SIZE));
		if (error) throw new Error(`Could not read studio identities: ${error.message}`);
		studios.push(...((data ?? []) as StudioSourceRow[]));
	}
	const studioByKey = new Map(studios.map((studio) => [studio.source_key, studio]));
	return new Map(
		aliases.flatMap((alias) => {
			const studio = studioByKey.get(alias.source_key);
			return studio
				? [
						[
							alias.alias_key,
							{
								sourceKey: studio.source_key,
								nameJa: studio.canonical_name_ja,
								nameEn: studio.canonical_name_en,
								sourceUrl: studio.source_url,
							},
						],
					]
				: [];
		}),
	);
}

function valuesDiffer(left: unknown, right: unknown): boolean {
	return !isDeepStrictEqual(left, right);
}

function changedFields(resolution: AnimeCatalogResolution, legacy: LegacyAnimeCatalogRow | undefined): string[] {
	if (!legacy) return Object.keys(resolution.canonical);
	return Object.entries(resolution.canonical)
		.filter(([field, value]) => valuesDiffer(value, legacy[field as keyof LegacyAnimeCatalogRow]))
		.map(([field]) => field);
}

async function saveResolutions(supabase: ReturnType<typeof getSupabaseClient>, resolutions: AnimeCatalogResolution[]) {
	const resolvedAt = new Date().toISOString();
	for (let start = 0; start < resolutions.length; start += BATCH_SIZE) {
		const batch = resolutions.slice(start, start + BATCH_SIZE);
		const { error: animeError } = await supabase.from("anime").upsert(
			batch.map((resolution) => resolution.canonical),
			{ onConflict: "mal_id" },
		);
		if (animeError) throw new Error(`Could not materialize anime catalog: ${animeError.message}`);

		const resolutionRows: ResolutionRecordInsert[] = batch.map((resolution) => ({
			mal_id: resolution.canonical.mal_id,
			resolved_data: resolution.canonical,
			field_sources: resolution.fieldSources,
			resolution_status: resolution.resolutionStatus,
			resolution_reasons: resolution.resolutionReasons,
			resolved_at: resolvedAt,
		}));
		const { error: resolutionError } = await supabase
			.from("anime_resolution_records")
			.upsert(resolutionRows, { onConflict: "mal_id" });
		if (resolutionError) throw new Error(`Could not save catalog provenance: ${resolutionError.message}`);
		console.log(`Resolved ${Math.min(start + batch.length, resolutions.length)}/${resolutions.length} anime.`);
	}
}

function readJikanRelations(records: readonly SourceRecordRow[]): Map<number, AnimeRelationRow[]> {
	const relationsByMalId = new Map<number, AnimeRelationRow[]>();
	for (const record of records) {
		if (record.source !== "jikan") continue;
		const normalized =
			record.normalized_data !== null && typeof record.normalized_data === "object"
				? (record.normalized_data as Record<string, unknown>)
				: {};
		const relations = Array.isArray(normalized["relations"]) ? normalized["relations"] : [];
		const validRelations = relations.flatMap((value) => {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
			const relation = value as Record<string, unknown>;
			const relatedMalId = relation["related_anime_mal_id"];
			const relationType = relation["relation_type"];
			const relatedTitle = relation["related_title"];
			if (
				typeof relatedMalId !== "number" ||
				!Number.isSafeInteger(relatedMalId) ||
				typeof relationType !== "string" ||
				!relationType.trim() ||
				typeof relatedTitle !== "string" ||
				!relatedTitle.trim()
			) {
				return [];
			}
			return [
				{
					anime_mal_id: record.mal_id,
					related_anime_mal_id: relatedMalId,
					relation_type: relationType.trim(),
					related_title: relatedTitle.trim(),
				},
			];
		});
		relationsByMalId.set(record.mal_id, validRelations);
	}
	return relationsByMalId;
}

async function syncResolvedRelations(
	supabase: ReturnType<typeof getSupabaseClient>,
	relationsByMalId: Map<number, AnimeRelationRow[]>,
) {
	const malIds = [...relationsByMalId.keys()];
	for (let start = 0; start < malIds.length; start += BATCH_SIZE) {
		const { error } = await supabase
			.from("anime_relations")
			.delete()
			.in("anime_mal_id", malIds.slice(start, start + BATCH_SIZE));
		if (error) throw new Error(`Could not replace resolved anime relations: ${error.message}`);
	}
	const relationRows = [...relationsByMalId.values()].flat();
	for (let start = 0; start < relationRows.length; start += BATCH_SIZE) {
		const { error } = await supabase.from("anime_relations").insert(relationRows.slice(start, start + BATCH_SIZE));
		if (error) throw new Error(`Could not save resolved anime relations: ${error.message}`);
	}
	if (malIds.length > 0) console.log(`Resolved ${relationRows.length} relations for ${malIds.length} anime.`);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const season = `${options.year}-${options.season}`;
	const supabase = getSupabaseClient();
	const seasonSourceRecords = await fetchSeasonSourceRecords(supabase, season);
	if (seasonSourceRecords.length === 0) throw new Error(`No ODbL or Jikan source records found for ${season}.`);
	const malIds = collectAnimeCatalogSeasonMalIds(seasonSourceRecords);
	const [sourceRecords, legacyRows] = await Promise.all([
		fetchAllSourceRecords(supabase, malIds),
		fetchLegacyRows(supabase, malIds),
	]);
	const studioMappings = await fetchStudioMappings(supabase, sourceRecords, legacyRows);
	const recordsByMalId = new Map<number, SourceRecordRow[]>();
	for (const record of sourceRecords) {
		const records = recordsByMalId.get(record.mal_id) ?? [];
		records.push(record);
		recordsByMalId.set(record.mal_id, records);
	}
	const legacyByMalId = new Map(legacyRows.map((row) => [row.mal_id, row]));
	const resolutions = malIds.map((malId) =>
		resolveAnimeCatalog(recordsByMalId.get(malId) ?? [], legacyByMalId.get(malId), (name) =>
			studioMappings.get(normalizeStudioAlias(name)),
		),
	);
	const counts = resolutions.reduce(
		(result, resolution) => {
			result[resolution.resolutionStatus] += 1;
			return result;
		},
		{ unverified: 0, review: 0, verified: 0 },
	);
	const changed = resolutions.filter(
		(resolution) => changedFields(resolution, legacyByMalId.get(resolution.canonical.mal_id)).length > 0,
	);
	console.log(
		`Resolution preview for ${season}: ${resolutions.length} total; ${counts.verified} displayable; ${counts.review + counts.unverified} hidden (${counts.review} review, ${counts.unverified} unverified); ${changed.length} canonical rows change.`,
	);
	console.log(
		JSON.stringify(
			changed.slice(0, 10).map((resolution) => ({
				mal_id: resolution.canonical.mal_id,
				title: resolution.canonical.title,
				resolution_status: resolution.resolutionStatus,
				changed_fields: changedFields(resolution, legacyByMalId.get(resolution.canonical.mal_id)),
				field_sources: resolution.fieldSources,
			})),
			null,
			2,
		),
	);
	if (options.dryRun) {
		console.log("Dry run complete. No database writes were made.");
		return;
	}
	await saveResolutions(supabase, resolutions);
	await syncResolvedRelations(supabase, readJikanRelations(sourceRecords));
	console.log(`Catalog resolution complete for ${season}.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
