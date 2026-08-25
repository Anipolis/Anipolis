import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";
import {
	ANIME_CATALOG_SEASON_SOURCES,
	type AnimeCatalogSeasonSource,
	collectAnimeCatalogSeasonMalIds,
} from "../src/lib/anime-catalog-season.ts";
import {
	findSyobocalOfficialSiteUrl,
	findSyobocalOfficialXUrl,
	findSyobocalWikipediaArticleLinks,
	findSyobocalWikipediaKeywordLinks,
	matchSyobocalTitlesByReading,
	matchSyobocalTitlesExactly,
	normalizeSyobocalTitle,
	parseSyobocalLinks,
	type SyobocalWikipediaArticleLink,
} from "../src/lib/syobocal.ts";
import {
	jstBroadcastDate,
	jstDate,
	rollingSyobocalProgramRange,
	selectPrimarySyobocalPrograms,
} from "../src/lib/syobocal-schedule.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";
type SourceName = AnimeCatalogSeasonSource | "manual" | "wikidata" | "syobocal";
type MatchMethod =
	| "manual"
	| "wikidata_property"
	| "wikipedia_wikidata"
	| "normalized_title_exact"
	| "reading_title_exact";

type Options = {
	year: number;
	season: SeasonName;
	dryRun: boolean;
	syncPrograms: boolean;
};

type SourceRecord = {
	mal_id: number;
	source: SourceName;
	normalized_data: Record<string, unknown>;
};

type CatalogCandidate = {
	malId: number;
	title: string;
	titleBasis: "verified_source" | "odbl_title_candidate" | "odbl_synonym_candidate";
	firstYear: number | null;
	firstMonth: number | null;
	validFrom: string | null;
	validTo: string | null;
	mediaType: string | null;
};

type SyobocalTitle = {
	tid: number;
	lastUpdate: string | null;
	title: string;
	shortTitle: string | null;
	titleYomi: string | null;
	category: number | null;
	firstYear: number | null;
	firstMonth: number | null;
	firstChannel: string | null;
	comment: string;
	links: { name: string; url: string }[];
	wikipediaLinks: SyobocalWikipediaArticleLink[];
	officialSiteUrl: string | null;
	officialXUrl: string | null;
	raw: Record<string, unknown>;
};

type SyobocalChannel = {
	chid: number;
	lastUpdate: string | null;
	name: string;
	epgName: string | null;
	channelGroupId: number | null;
	channelNumber: number | null;
	siteUrl: string | null;
	epgUrl: string | null;
	raw: Record<string, unknown>;
};

type SyobocalProgram = {
	pid: number;
	tid: number;
	chid: number;
	lastUpdate: string | null;
	startsAt: string;
	endsAt: string;
	startOffsetSeconds: number;
	episodeNumber: number | null;
	subtitle: string | null;
	programComment: string | null;
	flags: number;
	deleted: boolean;
	warning: boolean;
	revision: number;
	raw: Record<string, unknown>;
};

type ManualMapping = {
	mal_id: number;
	tid: number;
	use_for_title?: boolean;
	valid_from?: string;
	valid_to?: string;
	note?: string;
};

type ExistingMapping = {
	external_key: string;
	mal_id: number;
	match_method: MatchMethod;
	match_status: "candidate" | "confirmed" | "rejected";
	is_primary: boolean;
	use_for_title: boolean;
	valid_from: string | null;
	valid_to: string | null;
	evidence: Record<string, unknown>;
	source_url: string;
	source_version: string | null;
};

type MappingProposal = {
	malId: number;
	tid: number;
	method: MatchMethod;
	selectionPriority: number;
	useForTitle: boolean;
	validFrom: string | null;
	validTo: string | null;
	evidence: Record<string, unknown>;
	sourceUrl: string;
	sourceVersion: string | null;
};

const VALID_SEASONS = new Set<SeasonName>(["winter", "spring", "summer", "fall"]);
const DATABASE_BATCH_SIZE = 100;
const WIKIDATA_BATCH_SIZE = 100;
// Catalog-wide program sync queries ~1,800 TIDs; large batches with a gentle
// interval keep the request count low enough for Syobocal's rate limit.
const PROGRAM_TID_BATCH_SIZE = 100;
const SYOBOCAL_ENDPOINT = "https://cal.syoboi.jp/db.php";
const JAPANESE_WIKIPEDIA_ENDPOINT = "https://ja.wikipedia.org/w/api.php";
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Anipolis/1.0 (https://github.com/Anipolis/Anipolis)";
const CACHE_DIR = ".syobocal-import-cache";
const MANUAL_MAPPING_PATH = "scripts/data/syobocal-manual-mappings.json";
const xmlParser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false });

function parseArgs(argv: string[]): Options {
	const options: Partial<Options> & Pick<Options, "dryRun" | "syncPrograms"> = {
		dryRun: false,
		syncPrograms: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--sync-programs") {
			options.syncPrograms = true;
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
		throw new Error(
			"Usage: pnpm import:syobocal -- --year 2023 --season winter [--dry-run]\n" +
				"   or: pnpm sync:syobocal-programs -- --year 2026 --season summer [--dry-run]",
		);
	}
	return {
		year: options.year,
		season: options.season,
		dryRun: options.dryRun,
		syncPrograms: options.syncPrograms,
	};
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function asArray(value: unknown): unknown[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

function textValue(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	if (typeof value === "string") return value.trim() || null;
	if (typeof value === "number") return String(value);
	return null;
}

function integerValue(record: Record<string, unknown>, key: string): number | null {
	const value = textValue(record, key);
	if (!value || !/^-?\d+$/.test(value)) return null;
	const result = Number.parseInt(value, 10);
	return Number.isSafeInteger(result) ? result : null;
}

function booleanIntegerValue(record: Record<string, unknown>, key: string): boolean {
	return (integerValue(record, key) ?? 0) !== 0;
}

function containsJapaneseScript(value: string): boolean {
	return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

function toJstTimestamp(value: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(`${value.replace(" ", "T")}+09:00`);
	return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function dateOnly(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const match = value.match(/^\d{4}-\d{2}-\d{2}/);
	return match?.[0] ?? null;
}

function seasonRange(year: number, season: SeasonName) {
	const startMonths: Record<SeasonName, number> = { winter: 1, spring: 4, summer: 7, fall: 10 };
	const startMonth = startMonths[season];
	const endYear = season === "fall" ? year + 1 : year;
	const endMonth = season === "fall" ? 1 : startMonth + 3;
	return {
		startMonth,
		startDate: `${year}-${String(startMonth).padStart(2, "0")}-01`,
		endDate: `${endYear}-${String(endMonth).padStart(2, "0")}-01`,
	};
}

function monthIndex(year: number, month: number) {
	return year * 12 + month;
}

async function fetchWithRetry(url: URL, accept: string): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		try {
			const response = await fetch(url, { headers: { Accept: accept, "User-Agent": USER_AGENT } });
			if (response.ok) return response;
			if (response.status < 500 && response.status !== 429) {
				throw new Error(`${response.status} ${response.statusText}`);
			}
			lastError = new Error(`${response.status} ${response.statusText}`);
			// Rate limiting needs a real cool-down, not a sub-second retry.
			if (response.status === 429 && attempt < 4) {
				await sleep(30_000 * attempt);
				continue;
			}
		} catch (error) {
			lastError = error;
		}
		if (attempt < 4) await sleep(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250));
	}
	throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

async function readCachedXml(command: string, params: Record<string, string>, cacheName: string): Promise<unknown> {
	const url = new URL(SYOBOCAL_ENDPOINT);
	url.searchParams.set("Command", command);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	const cachePath = join(CACHE_DIR, cacheName);
	try {
		const response = await fetchWithRetry(url, "application/xml,text/xml");
		const xml = await response.text();
		await mkdir(dirname(cachePath), { recursive: true });
		const temporaryPath = `${cachePath}.tmp`;
		await writeFile(temporaryPath, xml, "utf8");
		await unlink(cachePath).catch(() => undefined);
		await rename(temporaryPath, cachePath);
		return xmlParser.parse(xml);
	} catch (error) {
		try {
			const xml = await readFile(cachePath, "utf8");
			console.warn(`Syobocal request failed; using cache ${cachePath}: ${String(error)}`);
			return xmlParser.parse(xml);
		} catch {
			throw new Error(`Syobocal ${command} failed and no cache is available: ${String(error)}`);
		}
	}
}

function responseItems(payload: unknown, responseKey: string, itemsKey: string, itemKey: string) {
	const response = asRecord(asRecord(payload)[responseKey]);
	const result = asRecord(response["Result"]);
	const code = textValue(result, "Code");
	// 404 means "no rows matched" (e.g. a program lookup for titles with no
	// slots in the range), which is a normal empty result, not a failure.
	if (code === "404") return [];
	if (code && code !== "200") throw new Error(`Syobocal returned ${code}: ${textValue(result, "Message") ?? ""}`);
	return asArray(asRecord(response[itemsKey])[itemKey]).map(asRecord);
}

function parseTitle(raw: Record<string, unknown>): SyobocalTitle | null {
	const tid = integerValue(raw, "TID");
	const title = textValue(raw, "Title");
	if (!tid || !title) return null;
	const comment = textValue(raw, "Comment") ?? "";
	const keywords = textValue(raw, "Keywords") ?? "";
	const links = parseSyobocalLinks(comment);
	const wikipediaLinks = [
		...findSyobocalWikipediaKeywordLinks(keywords),
		...findSyobocalWikipediaArticleLinks(comment),
	].filter(
		(link, index, values) =>
			values.findIndex(
				(candidate) =>
					candidate.articleTitle.normalize("NFKC").toLocaleLowerCase() ===
					link.articleTitle.normalize("NFKC").toLocaleLowerCase(),
			) === index,
	);
	return {
		tid,
		lastUpdate: textValue(raw, "LastUpdate"),
		title,
		shortTitle: textValue(raw, "ShortTitle"),
		titleYomi: textValue(raw, "TitleYomi"),
		category: integerValue(raw, "Cat"),
		firstYear: integerValue(raw, "FirstYear"),
		firstMonth: integerValue(raw, "FirstMonth"),
		firstChannel: textValue(raw, "FirstCh"),
		comment,
		links,
		wikipediaLinks,
		officialSiteUrl: findSyobocalOfficialSiteUrl(links),
		officialXUrl: findSyobocalOfficialXUrl(links),
		raw,
	};
}

function parseChannel(raw: Record<string, unknown>): SyobocalChannel | null {
	const chid = integerValue(raw, "ChID");
	const name = textValue(raw, "ChName");
	if (!chid || !name) return null;
	return {
		chid,
		lastUpdate: textValue(raw, "LastUpdate"),
		name,
		epgName: textValue(raw, "ChiEPGName"),
		channelGroupId: integerValue(raw, "ChGID"),
		channelNumber: integerValue(raw, "ChNumber"),
		siteUrl: textValue(raw, "ChURL"),
		epgUrl: textValue(raw, "ChEPGURL"),
		raw,
	};
}

function parseProgram(raw: Record<string, unknown>): SyobocalProgram | null {
	const pid = integerValue(raw, "PID");
	const tid = integerValue(raw, "TID");
	const chid = integerValue(raw, "ChID");
	const startsAt = toJstTimestamp(textValue(raw, "StTime"));
	const endsAt = toJstTimestamp(textValue(raw, "EdTime"));
	if (!pid || !tid || !chid || !startsAt || !endsAt) return null;
	return {
		pid,
		tid,
		chid,
		lastUpdate: textValue(raw, "LastUpdate"),
		startsAt,
		endsAt,
		startOffsetSeconds: integerValue(raw, "StOffset") ?? 0,
		episodeNumber: integerValue(raw, "Count"),
		subtitle: textValue(raw, "STSubTitle") ?? textValue(raw, "SubTitle"),
		programComment: textValue(raw, "ProgComment"),
		flags: integerValue(raw, "Flag") ?? 0,
		deleted: booleanIntegerValue(raw, "Deleted"),
		warning: booleanIntegerValue(raw, "Warn"),
		revision: integerValue(raw, "Revision") ?? 0,
		raw,
	};
}

async function fetchTitles(): Promise<SyobocalTitle[]> {
	const payload = await readCachedXml(
		"TitleLookup",
		{
			TID: "*",
			Fields: "TID,LastUpdate,Title,ShortTitle,TitleYomi,Comment,Keywords,Cat,FirstYear,FirstMonth,FirstCh",
		},
		"titles.xml",
	);
	const titles = responseItems(payload, "TitleLookupResponse", "TitleItems", "TitleItem").flatMap((row) => {
		const parsed = parseTitle(row);
		return parsed ? [parsed] : [];
	});
	if (titles.length < 1_000) {
		throw new Error(`Syobocal title snapshot is unexpectedly small (${titles.length} rows).`);
	}
	return titles;
}

async function fetchChannels(): Promise<SyobocalChannel[]> {
	const payload = await readCachedXml("ChLookup", { ChID: "*" }, "channels.xml");
	const channels = responseItems(payload, "ChLookupResponse", "ChItems", "ChItem").flatMap((row) => {
		const parsed = parseChannel(row);
		return parsed ? [parsed] : [];
	});
	if (channels.length < 10) {
		throw new Error(`Syobocal channel snapshot is unexpectedly small (${channels.length} rows).`);
	}
	return channels;
}

async function fetchPrograms(tids: number[], range: string): Promise<SyobocalProgram[]> {
	const programs: SyobocalProgram[] = [];
	for (let start = 0; start < tids.length; start += PROGRAM_TID_BATCH_SIZE) {
		const batch = tids.slice(start, start + PROGRAM_TID_BATCH_SIZE);
		// A joined TID list exceeds Windows path limits at this batch size; hash it.
		const batchKey = createHash("sha1").update(batch.join(",")).digest("hex").slice(0, 16);
		const cacheName = `programs/${range}-${batchKey}.xml`;
		const payload = await readCachedXml(
			"ProgLookup",
			{ TID: batch.join(","), Range: range, JOIN: "SubTitles" },
			cacheName,
		);
		const rows = responseItems(payload, "ProgLookupResponse", "ProgItems", "ProgItem");
		if (rows.length >= 5_000) {
			throw new Error(`Syobocal program query reached the 5,000 row limit for TIDs ${batch.join(",")}.`);
		}
		programs.push(
			...rows.flatMap((row) => {
				const parsed = parseProgram(row);
				return parsed ? [parsed] : [];
			}),
		);
		console.log(
			`Syobocal programs fetched for ${Math.min(start + batch.length, tids.length)}/${tids.length} TIDs.`,
		);
		await sleep(1000);
	}
	return [...new Map(programs.map((program) => [program.pid, program])).values()];
}

async function fetchSeasonRows(supabase: ReturnType<typeof getSupabaseClient>, season: string) {
	const rows: { mal_id: number; source: AnimeCatalogSeasonSource }[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("mal_id,source")
			.in("source", [...ANIME_CATALOG_SEASON_SOURCES])
			.filter("normalized_data->>season", "eq", season)
			.order("mal_id", { ascending: true })
			.order("source", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (error) throw new Error(`Could not read ODbL/Jikan season records: ${error.message}`);
		rows.push(...((data ?? []) as typeof rows));
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	return rows;
}

async function fetchSourceRecords(supabase: ReturnType<typeof getSupabaseClient>, malIds: number[]) {
	const rows: SourceRecord[] = [];
	for (let start = 0; start < malIds.length; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_source_records")
			.select("mal_id,source,normalized_data")
			.in("mal_id", malIds.slice(start, start + DATABASE_BATCH_SIZE))
			.in("source", ["manual", "wikidata", "jikan", "anime_offline_database"]);
		if (error) throw new Error(`Could not read anime source records: ${error.message}`);
		rows.push(...((data ?? []) as SourceRecord[]));
	}
	return rows;
}

function stringValue(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayValue(data: Record<string, unknown>, key: string): string[] {
	const value = data[key];
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

function catalogCandidates(records: SourceRecord[], malIds: number[], fallbackYear: number) {
	const byMal = new Map<number, Map<SourceName, Record<string, unknown>>>();
	for (const record of records) {
		const sources = byMal.get(record.mal_id) ?? new Map();
		sources.set(record.source, record.normalized_data);
		byMal.set(record.mal_id, sources);
	}
	return malIds.flatMap((malId): CatalogCandidate[] => {
		const sources = byMal.get(malId) ?? new Map();
		const manual = sources.get("manual") ?? {};
		const wikidata = sources.get("wikidata") ?? {};
		const mal = sources.get("mal") ?? {};
		const jikan = sources.get("jikan") ?? {};
		const offline = sources.get("anime_offline_database") ?? {};
		const jikanTitle =
			stringValue(jikan, "title_ja") ??
			(containsJapaneseScript(stringValue(jikan, "title") ?? "") ? stringValue(jikan, "title") : null);
		const offlineTitle = stringValue(offline, "title");
		const verifiedTitle =
			stringValue(manual, "title") ??
			stringValue(wikidata, "title_ja") ??
			stringValue(mal, "title_ja") ??
			jikanTitle;
		const airedFrom =
			stringValue(manual, "aired_from") ??
			stringValue(mal, "aired_from") ??
			stringValue(jikan, "aired_from") ??
			stringValue(offline, "aired_from");
		const airedTo =
			stringValue(manual, "aired_to") ??
			stringValue(mal, "aired_to") ??
			stringValue(jikan, "aired_to") ??
			stringValue(offline, "aired_to");
		const date = airedFrom?.match(/^(\d{4})-(\d{2})/);
		const base = {
			malId,
			firstYear: date ? Number.parseInt(date[1] ?? "", 10) : fallbackYear,
			firstMonth: date ? Number.parseInt(date[2] ?? "", 10) : null,
			validFrom: dateOnly(airedFrom),
			validTo: dateOnly(airedTo),
			mediaType: stringValue(mal, "type") ?? stringValue(jikan, "type") ?? null,
		};
		if (verifiedTitle && containsJapaneseScript(verifiedTitle)) {
			return [{ ...base, title: verifiedTitle, titleBasis: "verified_source" as const }];
		}
		const offlineCandidates = [
			...(offlineTitle && containsJapaneseScript(offlineTitle)
				? [{ title: offlineTitle, titleBasis: "odbl_title_candidate" as const }]
				: []),
			...stringArrayValue(offline, "title_ja_candidates")
				.filter(containsJapaneseScript)
				.map((title) => ({ title, titleBasis: "odbl_synonym_candidate" as const })),
		];
		return [...new Map(offlineCandidates.map((candidate) => [candidate.title, candidate])).values()].map(
			(candidate) => ({
				...base,
				...candidate,
			}),
		);
	});
}

async function readManualMappings(): Promise<ManualMapping[]> {
	const parsed = JSON.parse(await readFile(MANUAL_MAPPING_PATH, "utf8")) as unknown;
	if (!Array.isArray(parsed)) throw new Error(`${MANUAL_MAPPING_PATH} must contain a JSON array.`);
	const seen = new Set<number>();
	return parsed.map((value, index) => {
		const row = asRecord(value);
		const malId = row["mal_id"];
		const tid = row["tid"];
		if (!Number.isSafeInteger(malId) || Number(malId) <= 0 || !Number.isSafeInteger(tid) || Number(tid) <= 0) {
			throw new Error(`Invalid manual Syobocal mapping at index ${index}.`);
		}
		if (seen.has(Number(malId))) throw new Error(`Duplicate manual mapping for MAL ${malId}.`);
		seen.add(Number(malId));
		return {
			mal_id: Number(malId),
			tid: Number(tid),
			use_for_title: typeof row["use_for_title"] === "boolean" ? row["use_for_title"] : undefined,
			valid_from: typeof row["valid_from"] === "string" ? row["valid_from"] : undefined,
			valid_to: typeof row["valid_to"] === "string" ? row["valid_to"] : undefined,
			note: typeof row["note"] === "string" ? row["note"] : undefined,
		};
	});
}

type ProgramSyncMapping = {
	malId: number;
	tid: number;
	validFrom: string | null;
	validTo: string | null;
};

// Every confirmed primary Syobocal mapping in the catalog, regardless of
// season: the program sync follows these so the calendar and rooms are driven
// by Syobocal alone.
async function fetchAllPrimaryMappings(
	supabase: ReturnType<typeof getSupabaseClient>,
	dryRun: boolean,
): Promise<ProgramSyncMapping[]> {
	const rows: ProgramSyncMapping[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_external_mappings")
			.select("mal_id,external_key,valid_from,valid_to")
			.eq("external_source", "syobocal")
			.eq("is_primary", true)
			.eq("match_status", "confirmed")
			.order("mal_id", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (error) {
			if (dryRun && (error.code === "42P01" || error.code === "PGRST205")) return [];
			throw new Error(`Could not read catalog-wide Syobocal mappings: ${error.message}`);
		}
		for (const row of data ?? []) {
			const record = row as Record<string, unknown>;
			const tid = Number.parseInt(String(record["external_key"] ?? ""), 10);
			if (!Number.isSafeInteger(tid) || tid <= 0) continue;
			rows.push({
				malId: Number(record["mal_id"]),
				tid,
				validFrom: (record["valid_from"] as string | null) ?? null,
				validTo: (record["valid_to"] as string | null) ?? null,
			});
		}
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	return rows;
}

function mergeProgramSyncMappings(
	selected: readonly ProgramSyncMapping[],
	catalogWide: readonly ProgramSyncMapping[],
): ProgramSyncMapping[] {
	const byMal = new Map<number, ProgramSyncMapping>();
	for (const mapping of catalogWide) byMal.set(mapping.malId, mapping);
	// This run's freshly selected mappings supersede stored rows for their MAL ids.
	for (const mapping of selected) byMal.set(mapping.malId, mapping);
	return [...byMal.values()];
}

async function fetchExistingMappings(
	supabase: ReturnType<typeof getSupabaseClient>,
	malIds: number[],
	dryRun: boolean,
): Promise<ExistingMapping[]> {
	const rows: ExistingMapping[] = [];
	for (let start = 0; start < malIds.length; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime_external_mappings")
			.select(
				"external_key,mal_id,match_method,match_status,is_primary,use_for_title,valid_from,valid_to,evidence,source_url,source_version",
			)
			.eq("external_source", "syobocal")
			.in("mal_id", malIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) {
			if (dryRun && (error.code === "42P01" || error.code === "PGRST205")) {
				console.warn("Migration 103 is not applied; existing mappings are omitted from this dry run.");
				return [];
			}
			throw new Error(`Could not read Syobocal mappings (apply migration 103 first): ${error.message}`);
		}
		rows.push(...((data ?? []) as ExistingMapping[]));
	}
	return rows;
}

type WikidataBinding = {
	item?: { value?: string };
	mal?: { value?: string };
	tid?: { value?: string };
};

async function fetchWikidataProposals(malIds: number[], candidates: Map<number, CatalogCandidate>) {
	const rawByItem = new Map<string, { mals: Set<number>; tids: Set<number> }>();
	for (let start = 0; start < malIds.length; start += WIKIDATA_BATCH_SIZE) {
		const batch = malIds.slice(start, start + WIKIDATA_BATCH_SIZE);
		const query = `SELECT ?item ?mal ?tid WHERE {
			VALUES ?mal { ${batch.map((malId) => `"${malId}"`).join(" ")} }
			?item wdt:P4086 ?mal; wdt:P11648 ?tid.
		}`;
		const url = new URL(WIKIDATA_ENDPOINT);
		url.searchParams.set("query", query);
		url.searchParams.set("format", "json");
		const response = await fetchWithRetry(url, "application/sparql-results+json");
		const payload = (await response.json()) as { results?: { bindings?: WikidataBinding[] } };
		for (const binding of payload.results?.bindings ?? []) {
			const item = binding.item?.value;
			const malId = Number.parseInt(binding.mal?.value ?? "", 10);
			const tid = Number.parseInt(binding.tid?.value ?? "", 10);
			if (!item || !Number.isSafeInteger(malId) || !Number.isSafeInteger(tid)) continue;
			const group = rawByItem.get(item) ?? { mals: new Set<number>(), tids: new Set<number>() };
			group.mals.add(malId);
			group.tids.add(tid);
			rawByItem.set(item, group);
		}
		console.log(
			`Wikidata Syobocal IDs queried for ${Math.min(start + batch.length, malIds.length)}/${malIds.length} MAL IDs.`,
		);
		await sleep(250);
	}

	const byMal = new Map<number, { tid: number; item: string }[]>();
	for (const [item, group] of rawByItem) {
		if (group.mals.size !== 1 || group.tids.size !== 1) continue;
		const malId = [...group.mals][0];
		const tid = [...group.tids][0];
		if (!malId || !tid) continue;
		const values = byMal.get(malId) ?? [];
		values.push({ tid, item });
		byMal.set(malId, values);
	}
	return [...byMal.entries()].flatMap(([malId, values]): MappingProposal[] => {
		const tids = [...new Set(values.map((value) => value.tid))];
		if (tids.length !== 1) return [];
		const candidate = candidates.get(malId);
		return [
			{
				malId,
				tid: tids[0] as number,
				method: "wikidata_property",
				selectionPriority: 2,
				useForTitle: false,
				validFrom: candidate?.validFrom ?? null,
				validTo: candidate?.validTo ?? null,
				evidence: { wikidata_items: values.map((value) => value.item) },
				sourceUrl: values[0]?.item ?? "https://www.wikidata.org/wiki/Property:P11648",
				sourceVersion: new Date().toISOString().slice(0, 10),
			},
		];
	});
}

function wikipediaTitleKey(value: string): string {
	return value.normalize("NFKC").replaceAll("_", " ").trim().toLocaleLowerCase();
}

function wikidataItemId(value: unknown): string | null {
	return typeof value === "string" && /^Q[1-9]\d*$/.test(value) ? value : null;
}

async function fetchWikipediaWikidataItems(articleTitles: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const uniqueTitles = [...new Map(articleTitles.map((title) => [wikipediaTitleKey(title), title])).values()];
	for (let start = 0; start < uniqueTitles.length; start += 40) {
		const batch = uniqueTitles.slice(start, start + 40);
		const url = new URL(JAPANESE_WIKIPEDIA_ENDPOINT);
		url.searchParams.set("action", "query");
		url.searchParams.set("format", "json");
		url.searchParams.set("formatversion", "2");
		url.searchParams.set("redirects", "1");
		url.searchParams.set("prop", "pageprops");
		url.searchParams.set("ppprop", "wikibase_item");
		url.searchParams.set("titles", batch.join("|"));
		const response = await fetchWithRetry(url, "application/json");
		const payload = asRecord(await response.json());
		const query = asRecord(payload["query"]);
		const aliases = new Map<string, string>();
		for (const entry of [...asArray(query["normalized"]), ...asArray(query["redirects"])]) {
			const row = asRecord(entry);
			const from = textValue(row, "from");
			const to = textValue(row, "to");
			if (from && to) aliases.set(wikipediaTitleKey(from), to);
		}
		const itemByTitle = new Map<string, string>();
		for (const entry of asArray(query["pages"])) {
			const page = asRecord(entry);
			const title = textValue(page, "title");
			const item = wikidataItemId(asRecord(page["pageprops"])["wikibase_item"]);
			if (title && item) itemByTitle.set(wikipediaTitleKey(title), item);
		}
		for (const requestedTitle of batch) {
			let resolvedTitle = requestedTitle;
			const visited = new Set<string>();
			for (;;) {
				const key = wikipediaTitleKey(resolvedTitle);
				if (visited.has(key)) break;
				visited.add(key);
				const next = aliases.get(key);
				if (!next) break;
				resolvedTitle = next;
			}
			const item = itemByTitle.get(wikipediaTitleKey(resolvedTitle));
			if (item) result.set(wikipediaTitleKey(requestedTitle), item);
		}
		console.log(
			`Wikipedia articles resolved for ${Math.min(start + batch.length, uniqueTitles.length)}/${uniqueTitles.length} keywords.`,
		);
		await sleep(250);
	}
	return result;
}

type WikidataMalBinding = {
	item?: { value?: string };
	mal?: { value?: string };
};

async function fetchWikidataMalIds(itemIds: string[]): Promise<Map<string, Set<number>>> {
	const result = new Map<string, Set<number>>();
	for (let start = 0; start < itemIds.length; start += WIKIDATA_BATCH_SIZE) {
		const batch = itemIds.slice(start, start + WIKIDATA_BATCH_SIZE);
		const query = `SELECT ?item ?mal WHERE {
			VALUES ?item { ${batch.map((item) => `wd:${item}`).join(" ")} }
			?item wdt:P4086 ?mal.
		}`;
		const url = new URL(WIKIDATA_ENDPOINT);
		url.searchParams.set("query", query);
		url.searchParams.set("format", "json");
		const response = await fetchWithRetry(url, "application/sparql-results+json");
		const payload = (await response.json()) as { results?: { bindings?: WikidataMalBinding[] } };
		for (const binding of payload.results?.bindings ?? []) {
			const item = binding.item?.value?.match(/\/(Q[1-9]\d*)$/)?.[1];
			const malId = Number.parseInt(binding.mal?.value ?? "", 10);
			if (!item || !Number.isSafeInteger(malId)) continue;
			const values = result.get(item) ?? new Set<number>();
			values.add(malId);
			result.set(item, values);
		}
		await sleep(250);
	}
	return result;
}

async function fetchWikipediaProposals(
	targetMalIds: readonly number[],
	candidates: readonly CatalogCandidate[],
	titles: readonly SyobocalTitle[],
): Promise<MappingProposal[]> {
	const linkedTitles = titles.flatMap((title) => title.wikipediaLinks.map((link) => ({ title, link })));
	if (linkedTitles.length === 0) return [];
	const itemByArticle = await fetchWikipediaWikidataItems(linkedTitles.map(({ link }) => link.articleTitle));
	const malIdsByItem = await fetchWikidataMalIds([...new Set(itemByArticle.values())]);
	const targetMalIdSet = new Set(targetMalIds);
	const evidenceByTid = new Map<
		number,
		{ malId: number; title: SyobocalTitle; link: SyobocalWikipediaArticleLink; item: string }[]
	>();
	for (const { title, link } of linkedTitles) {
		const item = itemByArticle.get(wikipediaTitleKey(link.articleTitle));
		if (!item) continue;
		const malIds = [...(malIdsByItem.get(item) ?? [])];
		if (malIds.length !== 1 || !targetMalIdSet.has(malIds[0] as number)) continue;
		const rows = evidenceByTid.get(title.tid) ?? [];
		rows.push({ malId: malIds[0] as number, title, link, item });
		evidenceByTid.set(title.tid, rows);
	}

	const unambiguous = [...evidenceByTid.entries()].flatMap(([tid, rows]) => {
		const malIds = [...new Set(rows.map((row) => row.malId))];
		return malIds.length === 1 ? rows.map((row) => ({ ...row, tid })) : [];
	});
	const byMal = new Map<number, typeof unambiguous>();
	for (const row of unambiguous) {
		const rows = byMal.get(row.malId) ?? [];
		rows.push(row);
		byMal.set(row.malId, rows);
	}
	const candidatesByMal = new Map<number, CatalogCandidate[]>();
	for (const candidate of candidates) {
		const values = candidatesByMal.get(candidate.malId) ?? [];
		values.push(candidate);
		candidatesByMal.set(candidate.malId, values);
	}
	const proposals = [...byMal.entries()].flatMap(([malId, rows]): MappingProposal[] => {
		const tids = [...new Set(rows.map((row) => row.tid))];
		if (tids.length !== 1) return [];
		const title = rows[0]?.title;
		if (!title) return [];
		const catalogCandidates = candidatesByMal.get(malId) ?? [];
		return [
			{
				malId,
				tid: tids[0] as number,
				method: "wikipedia_wikidata",
				selectionPriority: 1.5,
				useForTitle: catalogCandidates.some(
					(candidate) => normalizeSyobocalTitle(candidate.title) === normalizeSyobocalTitle(title.title),
				),
				validFrom: catalogCandidates[0]?.validFrom ?? null,
				validTo: catalogCandidates[0]?.validTo ?? null,
				evidence: {
					wikipedia_links: rows.map((row) => ({
						url: row.link.url,
						article_title: row.link.articleTitle,
						basis: row.link.basis,
						wikidata_item: `https://www.wikidata.org/wiki/${row.item}`,
					})),
					wikidata_mal_id: malId,
					catalog_titles: catalogCandidates.map((candidate) => ({
						title: candidate.title,
						basis: candidate.titleBasis,
					})),
					syobocal_title: title.title,
				},
				sourceUrl: rows[0]?.link.url ?? `https://cal.syoboi.jp/tid/${title.tid}`,
				sourceVersion: title.lastUpdate,
			},
		];
	});
	console.log(
		`Wikipedia/Wikidata mapping: ${linkedTitles.length} links, ${itemByArticle.size} QIDs, ${proposals.length} unambiguous MAL mappings.`,
	);
	return proposals;
}

function buildMappings(
	targetMalIds: readonly number[],
	candidates: CatalogCandidate[],
	matchingTitles: SyobocalTitle[],
	allTitles: SyobocalTitle[],
	manualMappings: ManualMapping[],
	existingMappings: ExistingMapping[],
	wikidataProposals: MappingProposal[],
	wikipediaProposals: MappingProposal[],
) {
	const targetMalIdSet = new Set(targetMalIds);
	const candidatesByMal = new Map(candidates.map((candidate) => [candidate.malId, candidate]));
	const titlesByTid = new Map(allTitles.map((title) => [title.tid, title]));
	const exactProposals: MappingProposal[] = matchSyobocalTitlesExactly(candidates, matchingTitles).map((match) => {
		const candidate =
			candidates.find(
				(value) => value.malId === match.malId && normalizeSyobocalTitle(value.title) === match.normalizedTitle,
			) ?? candidatesByMal.get(match.malId);
		const title = titlesByTid.get(match.tid);
		return {
			malId: match.malId,
			tid: match.tid,
			method: "normalized_title_exact",
			selectionPriority: 1,
			useForTitle: true,
			validFrom: candidate?.validFrom ?? null,
			validTo: candidate?.validTo ?? null,
			evidence: {
				normalized_title: match.normalizedTitle,
				catalog_title: candidate?.title,
				catalog_title_basis: candidate?.titleBasis,
				syobocal_title: title?.title,
			},
			sourceUrl: `https://cal.syoboi.jp/tid/${match.tid}`,
			sourceVersion: title?.lastUpdate ?? null,
		};
	});
	for (const proposal of wikidataProposals) {
		const title = titlesByTid.get(proposal.tid);
		const matchingCandidates = candidates.filter((candidate) => candidate.malId === proposal.malId);
		proposal.useForTitle = Boolean(
			title &&
				matchingCandidates.some(
					(candidate) => normalizeSyobocalTitle(title.title) === normalizeSyobocalTitle(candidate.title),
				),
		);
		proposal.evidence = {
			...proposal.evidence,
			catalog_titles: matchingCandidates.map((candidate) => ({
				title: candidate.title,
				basis: candidate.titleBasis,
			})),
			syobocal_title: title?.title,
		};
		proposal.sourceVersion = title?.lastUpdate ?? proposal.sourceVersion;
	}
	const existingManual: MappingProposal[] = existingMappings.flatMap((mapping) =>
		mapping.is_primary && mapping.match_status === "confirmed" && mapping.match_method === "manual"
			? [
					{
						malId: mapping.mal_id,
						tid: Number.parseInt(mapping.external_key, 10),
						method: "manual" as const,
						selectionPriority: 3,
						useForTitle: mapping.use_for_title,
						validFrom: mapping.valid_from,
						validTo: mapping.valid_to,
						evidence: mapping.evidence,
						sourceUrl: mapping.source_url,
						sourceVersion: mapping.source_version,
					},
				]
			: [],
	);
	const fileManual: MappingProposal[] = manualMappings.flatMap((mapping) => {
		const candidate = candidatesByMal.get(mapping.mal_id);
		const title = titlesByTid.get(mapping.tid);
		if (!targetMalIdSet.has(mapping.mal_id) || !title) return [];
		return [
			{
				malId: mapping.mal_id,
				tid: mapping.tid,
				method: "manual",
				selectionPriority: 4,
				useForTitle: mapping.use_for_title ?? true,
				validFrom: mapping.valid_from ?? candidate?.validFrom ?? null,
				validTo: mapping.valid_to ?? candidate?.validTo ?? null,
				evidence: {
					catalog_title: candidate?.title,
					catalog_title_basis: candidate?.titleBasis,
					syobocal_title: title.title,
					note: mapping.note,
					mapping_file: MANUAL_MAPPING_PATH,
				},
				sourceUrl: `https://cal.syoboi.jp/tid/${mapping.tid}`,
				sourceVersion: title.lastUpdate,
			},
		];
	});

	// Reading/Latin second-tier matches: only for MAL entries and TIDs that no
	// higher-confidence proposal already claims.
	const claimedMalIds = new Set(
		[...exactProposals, ...wikipediaProposals, ...wikidataProposals, ...existingManual, ...fileManual].map(
			(proposal) => proposal.malId,
		),
	);
	const claimedTids = new Set(
		[...exactProposals, ...wikipediaProposals, ...wikidataProposals, ...existingManual, ...fileManual].map(
			(proposal) => proposal.tid,
		),
	);
	const readingProposals: MappingProposal[] = matchSyobocalTitlesByReading(candidates, matchingTitles).flatMap(
		(match) => {
			if (claimedMalIds.has(match.malId) || claimedTids.has(match.tid)) return [];
			const candidate = candidatesByMal.get(match.malId);
			const title = titlesByTid.get(match.tid);
			return [
				{
					malId: match.malId,
					tid: match.tid,
					method: "reading_title_exact" as const,
					selectionPriority: 0.9,
					useForTitle: true,
					validFrom: candidate?.validFrom ?? null,
					validTo: candidate?.validTo ?? null,
					evidence: {
						match_key: match.matchKey,
						catalog_title: candidate?.title,
						catalog_title_basis: candidate?.titleBasis,
						syobocal_title: title?.title,
						syobocal_title_yomi: title?.titleYomi,
					},
					sourceUrl: `https://cal.syoboi.jp/tid/${match.tid}`,
					sourceVersion: title?.lastUpdate ?? null,
				},
			];
		},
	);
	if (readingProposals.length > 0) {
		console.log(`Reading/Latin title matching added ${readingProposals.length} proposals.`);
	}

	const proposals = [
		...exactProposals,
		...readingProposals,
		...wikipediaProposals,
		...wikidataProposals,
		...existingManual,
		...fileManual,
	];
	const selected = new Map<number, MappingProposal>();
	const review: string[] = [];
	for (const proposal of proposals) {
		if (!titlesByTid.has(proposal.tid)) {
			review.push(`MAL ${proposal.malId}: TID ${proposal.tid} was not found in the Syobocal title snapshot.`);
			continue;
		}
		const current = selected.get(proposal.malId);
		if (!current || proposal.selectionPriority > current.selectionPriority) {
			selected.set(proposal.malId, proposal);
			continue;
		}
		if (proposal.selectionPriority === current.selectionPriority && proposal.tid !== current.tid) {
			review.push(
				`MAL ${proposal.malId}: conflicting ${proposal.method} mappings TID ${current.tid} / ${proposal.tid}.`,
			);
			selected.delete(proposal.malId);
		}
	}
	return { proposals, selected: [...selected.values()], review };
}

async function upsertBatches(
	supabase: ReturnType<typeof getSupabaseClient>,
	table: string,
	rows: Record<string, unknown>[],
	onConflict: string,
) {
	for (let start = 0; start < rows.length; start += DATABASE_BATCH_SIZE) {
		const { error } = await supabase
			.from(table)
			.upsert(rows.slice(start, start + DATABASE_BATCH_SIZE), { onConflict });
		if (error) throw new Error(`Could not save ${table}: ${error.message}`);
	}
}

async function writeReviewReport(
	season: string,
	targetMalIds: readonly number[],
	candidates: CatalogCandidate[],
	titles: SyobocalTitle[],
	selected: MappingProposal[],
	review: string[],
	programCount: number,
) {
	const selectedMalIds = new Set(selected.map((mapping) => mapping.malId));
	const candidatesByMal = new Map<number, CatalogCandidate[]>();
	for (const candidate of candidates) {
		const values = candidatesByMal.get(candidate.malId) ?? [];
		values.push(candidate);
		candidatesByMal.set(candidate.malId, values);
	}
	const titlesByTid = new Map(titles.map((title) => [title.tid, title]));
	const unresolvedMalIds = [...candidatesByMal.keys()].filter((malId) => !selectedMalIds.has(malId));
	const report = {
		season,
		generated_at: new Date().toISOString(),
		summary: {
			target_mal_ids: targetMalIds.length,
			mal_ids_with_japanese_title_candidates: candidatesByMal.size,
			mal_ids_without_japanese_title_candidates: targetMalIds.length - candidatesByMal.size,
			confirmed_mappings: selected.length,
			unresolved_mappings_with_title_candidates: unresolvedMalIds.length,
			program_slots: programCount,
		},
		confirmed: selected
			.map((mapping) => ({
				mal_id: mapping.malId,
				mal_titles: (candidatesByMal.get(mapping.malId) ?? []).map((candidate) => ({
					title: candidate.title,
					basis: candidate.titleBasis,
				})),
				tid: mapping.tid,
				syobocal_title: titlesByTid.get(mapping.tid)?.title ?? null,
				match_method: mapping.method,
				use_for_title: mapping.useForTitle,
				source_url: `https://cal.syoboi.jp/tid/${mapping.tid}`,
			}))
			.sort((left, right) => left.mal_id - right.mal_id),
		unresolved: unresolvedMalIds
			.map((malId) => ({
				mal_id: malId,
				titles: (candidatesByMal.get(malId) ?? []).map((candidate) => ({
					title: candidate.title,
					basis: candidate.titleBasis,
				})),
				first_year: candidatesByMal.get(malId)?.[0]?.firstYear ?? null,
				first_month: candidatesByMal.get(malId)?.[0]?.firstMonth ?? null,
			}))
			.sort((left, right) => left.mal_id - right.mal_id),
		conflicts: review,
	};
	const reportPath = join(CACHE_DIR, "reviews", `${season}.json`);
	await mkdir(dirname(reportPath), { recursive: true });
	const temporaryPath = `${reportPath}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	await unlink(reportPath).catch(() => undefined);
	await rename(temporaryPath, reportPath);
	console.log(`Review report: ${reportPath}`);
}

async function saveMappings(
	supabase: ReturnType<typeof getSupabaseClient>,
	proposals: MappingProposal[],
	selected: MappingProposal[],
) {
	const selectedKeys = new Set(selected.map((mapping) => `${mapping.malId}:${mapping.tid}`));
	const selectedMalIds = [...new Set(selected.map((mapping) => mapping.malId))];
	for (let start = 0; start < selectedMalIds.length; start += DATABASE_BATCH_SIZE) {
		const { error } = await supabase
			.from("anime_external_mappings")
			.update({ is_primary: false })
			.eq("external_source", "syobocal")
			.in("mal_id", selectedMalIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) throw new Error(`Could not demote old Syobocal mappings: ${error.message}`);
	}
	const byKey = new Map<string, MappingProposal>();
	for (const proposal of proposals) {
		const key = `${proposal.malId}:${proposal.tid}`;
		const current = byKey.get(key);
		if (!current || proposal.selectionPriority > current.selectionPriority) byKey.set(key, proposal);
	}
	const importedAt = new Date().toISOString();
	await upsertBatches(
		supabase,
		"anime_external_mappings",
		[...byKey.values()].map((proposal) => {
			const primary = selectedKeys.has(`${proposal.malId}:${proposal.tid}`);
			return {
				external_source: "syobocal",
				external_key: String(proposal.tid),
				mal_id: proposal.malId,
				match_method: proposal.method,
				match_status: primary ? "confirmed" : "candidate",
				is_primary: primary,
				use_for_title: primary && proposal.useForTitle,
				valid_from: proposal.validFrom,
				valid_to: proposal.validTo,
				evidence: proposal.evidence,
				source_url: proposal.sourceUrl,
				source_version: proposal.sourceVersion,
				imported_at: importedAt,
				reviewed_at: proposal.method === "manual" && primary ? importedAt : null,
			};
		}),
		"external_source,external_key,mal_id",
	);
}

type AnimeRoomRow = {
	id: number;
	mal_id: number;
	room_type: string | null;
	metadata_ready: boolean;
	hidden_by_admin: boolean;
	broadcast_room_pre_open_minutes: number | null;
	broadcast_room_post_close_minutes: number | null;
};

type BroadcastRoomSessionRow = {
	id: string;
	anime_id: number;
	room_key: string;
	schedule_source: string | null;
	source_program_id: number | null;
	schedule_frozen_at: string | null;
	scheduled_at: string;
	posting_opens_at: string;
};

async function fetchAnimeRoomRows(supabase: ReturnType<typeof getSupabaseClient>, malIds: number[]) {
	const rows: AnimeRoomRow[] = [];
	for (let start = 0; start < malIds.length; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select(
				"id,mal_id,room_type,metadata_ready,hidden_by_admin,broadcast_room_pre_open_minutes,broadcast_room_post_close_minutes",
			)
			.in("mal_id", malIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) throw new Error(`Could not read anime room settings: ${error.message}`);
		rows.push(...((data ?? []) as AnimeRoomRow[]));
	}
	return rows;
}

function buildBroadcastRoomSessionRows(
	animeRows: AnimeRoomRow[],
	mappings: readonly ProgramSyncMapping[],
	titles: SyobocalTitle[],
	channels: SyobocalChannel[],
	programs: SyobocalProgram[],
	importedAt: string,
) {
	const animeByMal = new Map(animeRows.map((anime) => [anime.mal_id, anime]));
	const primaryPrograms = selectPrimarySyobocalPrograms(mappings, titles, channels, programs);
	const now = Date.now();
	const rows = primaryPrograms.flatMap((program) => {
		const anime = animeByMal.get(program.malId);
		if (!anime || anime.room_type === "global" || !anime.metadata_ready || anime.hidden_by_admin) return [];
		const startsAt = Date.parse(program.startsAt);
		const endsAt = Date.parse(program.endsAt);
		const durationMinutes = Math.round((endsAt - startsAt) / 60_000);
		if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || durationMinutes < 1 || durationMinutes > 1_440) {
			return [];
		}
		const preOpenMinutes = anime.broadcast_room_pre_open_minutes ?? 5;
		const postCloseMinutes = anime.broadcast_room_post_close_minutes ?? 30;
		const postingOpensAt = startsAt - preOpenMinutes * 60_000;
		if (postingOpensAt <= now) return [];
		// 深夜アニメ慣習: 4時前の枠は前日の放送日として room_date を振る
		// （overrides / ensure_broadcast_room_session と同じ基準）
		const roomDate = jstBroadcastDate(program.startsAt);
		return [
			{
				anime_id: anime.id,
				room_date: roomDate,
				room_kind: "episode",
				room_key: roomDate,
				scheduled_at: program.startsAt,
				duration_minutes: durationMinutes,
				posting_opens_at: new Date(postingOpensAt).toISOString(),
				posting_closes_at: new Date(endsAt + postCloseMinutes * 60_000).toISOString(),
				schedule_source: "syobocal",
				source_program_id: program.pid,
				source_title_id: program.tid,
				source_channel_id: program.chid,
				source_channel_name: program.channelName,
				episode_number: program.episodeNumber,
				episode_title: program.subtitle,
				source_snapshot: {
					syobocal_pid: program.pid,
					syobocal_tid: program.tid,
					syobocal_chid: program.chid,
					channel_name: program.channelName,
					episode_number: program.episodeNumber,
					episode_title: program.subtitle,
					scheduled_at: program.startsAt,
					ends_at: program.endsAt,
					source_url: `https://cal.syoboi.jp/tid/${program.tid}`,
					captured_at: importedAt,
				},
			},
		];
	});

	const byAnimeDate = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		const key = `${row.anime_id}:${row.room_date}`;
		const current = byAnimeDate.get(key);
		if (!current || Date.parse(row.scheduled_at) < Date.parse(current.scheduled_at)) byAnimeDate.set(key, row);
	}
	return [...byAnimeDate.values()].sort(
		(left, right) => Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at),
	);
}

async function saveBroadcastRoomSessions(
	supabase: ReturnType<typeof getSupabaseClient>,
	rows: ReturnType<typeof buildBroadcastRoomSessionRows>,
	window: { startDate: string; endDate: string },
	targetAnimeIds: readonly number[],
) {
	const animeIds = [...new Set(targetAnimeIds)];
	if (animeIds.length === 0) return;
	const existing: BroadcastRoomSessionRow[] = [];
	for (let start = 0; start < animeIds.length; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("broadcast_room_sessions")
			.select(
				"id,anime_id,room_key,schedule_source,source_program_id,schedule_frozen_at,scheduled_at,posting_opens_at",
			)
			.eq("room_kind", "episode")
			.in("anime_id", animeIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error)
			throw new Error(`Could not read broadcast room sessions (apply migration 104 first): ${error.message}`);
		existing.push(...((data ?? []) as BroadcastRoomSessionRow[]));
	}
	const byPid = new Map(
		existing.flatMap((session) =>
			session.source_program_id === null ? [] : ([[session.source_program_id, session]] as const),
		),
	);
	const byAnimeDate = new Map(existing.map((session) => [`${session.anime_id}:${session.room_key}`, session]));
	const now = Date.now();
	const existingRows: Record<string, unknown>[] = [];
	const newRows: Record<string, unknown>[] = [];
	const usedExistingIds = new Set<string>();
	for (const row of rows) {
		const current = byPid.get(row.source_program_id) ?? byAnimeDate.get(`${row.anime_id}:${row.room_key}`);
		if (current) {
			if (current.schedule_frozen_at || Date.parse(current.posting_opens_at) <= now) continue;
			usedExistingIds.add(current.id);
			existingRows.push({ id: current.id, ...row });
		} else {
			newRows.push(row);
		}
	}
	await upsertBatches(supabase, "broadcast_room_sessions", existingRows, "id");
	await upsertBatches(supabase, "broadcast_room_sessions", newRows, "anime_id,room_kind,room_key");
	const staleIds = existing
		.filter(
			(session) =>
				session.schedule_source === "syobocal" &&
				!usedExistingIds.has(session.id) &&
				!session.schedule_frozen_at &&
				Date.parse(session.posting_opens_at) > now &&
				jstDate(session.scheduled_at) >= window.startDate &&
				jstDate(session.scheduled_at) < window.endDate,
		)
		.map((session) => session.id);
	for (let start = 0; start < staleIds.length; start += DATABASE_BATCH_SIZE) {
		const { error } = await supabase
			.from("broadcast_room_sessions")
			.delete()
			.in("id", staleIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) throw new Error(`Could not remove stale future room sessions: ${error.message}`);
	}
	console.log(
		`Saved ${existingRows.length + newRows.length} future room snapshots; removed ${staleIds.length} stale future sessions.`,
	);
}

async function pruneExpiredSyobocalPrograms(supabase: ReturnType<typeof getSupabaseClient>) {
	const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
	const { error, count } = await supabase.from("syobocal_programs").delete({ count: "exact" }).lt("ends_at", cutoff);
	if (error) throw new Error(`Could not prune expired Syobocal program rows: ${error.message}`);
	console.log(`Pruned ${count ?? 0} Syobocal program rows older than seven days.`);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const season = `${options.year}-${options.season}`;
	const range = seasonRange(options.year, options.season);
	const importedAt = new Date().toISOString();
	const supabase = getSupabaseClient();
	const seasonRows = await fetchSeasonRows(supabase, season);
	const malIds = collectAnimeCatalogSeasonMalIds(seasonRows);
	if (malIds.length === 0) throw new Error(`No ODbL or Jikan source records found for ${season}.`);
	const records = await fetchSourceRecords(supabase, malIds);
	const candidates = catalogCandidates(records, malIds, options.year);
	const candidatesByMal = new Map(candidates.map((candidate) => [candidate.malId, candidate]));
	const candidateMalIds = new Set(candidates.map((candidate) => candidate.malId));
	const verifiedCandidateMalIds = new Set(
		candidates
			.filter((candidate) => candidate.titleBasis === "verified_source")
			.map((candidate) => candidate.malId),
	);
	console.log(
		`${season}: ${malIds.length} source identities, ${candidateMalIds.size} with Japanese title match candidates (${verifiedCandidateMalIds.size} from verified sources).`,
	);

	const [titles, manualMappings, existingMappings] = await Promise.all([
		fetchTitles(),
		readManualMappings(),
		fetchExistingMappings(supabase, malIds, options.dryRun),
	]);
	const windowStart = monthIndex(options.year, range.startMonth) - 1;
	const endDate = new Date(`${range.endDate}T00:00:00Z`);
	const windowEnd = monthIndex(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1) + 1;
	const seasonalTitles = titles.filter((title) => {
		if (title.firstYear === null || title.firstMonth === null) return false;
		const index = monthIndex(title.firstYear, title.firstMonth);
		return index >= windowStart && index <= windowEnd;
	});
	const wikidata = await fetchWikidataProposals(malIds, candidatesByMal).catch((error) => {
		console.warn(
			`Wikidata mapping lookup failed; continuing with manual and exact-title matching: ${String(error)}`,
		);
		return [];
	});
	const wikipedia = await fetchWikipediaProposals(malIds, candidates, seasonalTitles).catch((error) => {
		console.warn(
			`Wikipedia/Wikidata mapping lookup failed; continuing without Wikipedia keyword mappings: ${String(error)}`,
		);
		return [];
	});
	const mapping = buildMappings(
		malIds,
		candidates,
		seasonalTitles,
		titles,
		manualMappings,
		existingMappings,
		wikidata,
		wikipedia,
	);
	console.log(
		`Syobocal: ${titles.length} titles fetched, ${seasonalTitles.length} near season, ${mapping.selected.length} confirmed mappings.`,
	);
	for (const line of mapping.review) console.warn(`REVIEW: ${line}`);

	const titleByTid = new Map(titles.map((title) => [title.tid, title] as const));
	const selectedTitleByTid = new Map(
		mapping.selected.flatMap((proposal) => {
			const title = titleByTid.get(proposal.tid);
			return title ? [[proposal.tid, title] as const] : [];
		}),
	);
	// Syobocal is the source of truth for the calendar and rooms: program slots
	// are synced for every confirmed primary mapping in the catalog, not just
	// the imported season, so continuing shows keep their schedule and shows
	// without current Syobocal programs disappear naturally.
	const programMappings: ProgramSyncMapping[] = options.syncPrograms
		? mergeProgramSyncMappings(mapping.selected, await fetchAllPrimaryMappings(supabase, options.dryRun))
		: mapping.selected;
	// Sorted for stable batch composition, so the per-batch response cache hits
	// across reruns of the same day.
	const programTids = [...new Set(programMappings.map((entry) => entry.tid))]
		.filter((tid) => titleByTid.has(tid))
		.sort((left, right) => left - right);
	const titlesToStore = [
		...new Map(
			[
				...seasonalTitles,
				...selectedTitleByTid.values(),
				...programTids.flatMap((tid) => {
					const title = titleByTid.get(tid);
					return title ? [title] : [];
				}),
			].map((title) => [title.tid, title]),
		).values(),
	];
	let programs: SyobocalProgram[] = [];
	let channels: SyobocalChannel[] = [];
	// The program window is purely rolling (yesterday through +91 days): with
	// catalog-wide mappings the season clamp would wrongly cut continuing shows.
	const programRange = options.syncPrograms ? rollingSyobocalProgramRange("1900-01-01", "2999-12-31") : null;
	if (programRange && programMappings.length > 0) {
		console.log(
			`Program sync range: ${programRange.startDate} through ${programRange.endDate} (end exclusive) for ${programTids.length} mapped titles.`,
		);
		programs = await fetchPrograms(programTids, programRange.apiRange);
		const allChannels = await fetchChannels();
		const usedChids = new Set(programs.map((program) => program.chid));
		channels = allChannels.filter((channel) => usedChids.has(channel.chid));
		const missingChids = [...usedChids].filter((chid) => !channels.some((channel) => channel.chid === chid));
		if (missingChids.length > 0) throw new Error(`Missing Syobocal channels: ${missingChids.join(", ")}`);
	}
	const animeRoomRows = programRange
		? await fetchAnimeRoomRows(supabase, [...new Set(programMappings.map((proposal) => proposal.malId))])
		: [];
	const roomSessionRows = buildBroadcastRoomSessionRows(
		animeRoomRows,
		programMappings,
		programTids.flatMap((tid) => {
			const title = titleByTid.get(tid);
			return title ? [title] : [];
		}),
		channels,
		programs,
		importedAt,
	);

	const selectedMalIdsForReview = new Set(mapping.selected.map((row) => row.malId));
	const unresolvedMalIds = [...candidateMalIds].filter((malId) => !selectedMalIdsForReview.has(malId));
	console.log(
		`Result: ${programs.length} rolling program slots, ${channels.length} channels, ${roomSessionRows.length} future room snapshots, ${unresolvedMalIds.length} unmapped entries with title candidates.`,
	);
	if (unresolvedMalIds.length > 0) {
		console.log("Unresolved MAL IDs:");
		for (const malId of unresolvedMalIds.slice(0, 25)) {
			const titleCandidates = candidates.filter((candidate) => candidate.malId === malId);
			console.log(`  ${malId}\t${titleCandidates.map((candidate) => candidate.title).join(" / ")}`);
		}
		if (unresolvedMalIds.length > 25) {
			console.log(`  ... ${unresolvedMalIds.length - 25} more; see the review report.`);
		}
	}
	await writeReviewReport(season, malIds, candidates, titles, mapping.selected, mapping.review, programs.length);
	if (options.dryRun) {
		console.log("Dry run: no database rows were written.");
		return;
	}

	await upsertBatches(
		supabase,
		"syobocal_titles",
		titlesToStore.map((title) => ({
			tid: title.tid,
			source_url: `https://cal.syoboi.jp/tid/${title.tid}`,
			title: title.title,
			short_title: title.shortTitle,
			title_yomi: title.titleYomi,
			category: title.category,
			first_year: title.firstYear,
			first_month: title.firstMonth,
			first_channel: title.firstChannel,
			official_site_url: title.officialSiteUrl,
			official_x_url: title.officialXUrl,
			links: title.links,
			raw_data: title.raw,
			source_updated_at: toJstTimestamp(title.lastUpdate),
			imported_at: importedAt,
		})),
		"tid",
	);
	await saveMappings(supabase, mapping.proposals, mapping.selected);
	if (channels.length > 0) {
		await upsertBatches(
			supabase,
			"syobocal_channels",
			channels.map((channel) => ({
				chid: channel.chid,
				name: channel.name,
				epg_name: channel.epgName,
				channel_group_id: channel.channelGroupId,
				channel_number: channel.channelNumber,
				site_url: channel.siteUrl,
				epg_url: channel.epgUrl,
				raw_data: channel.raw,
				source_updated_at: toJstTimestamp(channel.lastUpdate),
				imported_at: importedAt,
			})),
			"chid",
		);
	}
	if (programs.length > 0) {
		await upsertBatches(
			supabase,
			"syobocal_programs",
			programs.map((program) => ({
				pid: program.pid,
				tid: program.tid,
				chid: program.chid,
				starts_at: program.startsAt,
				ends_at: program.endsAt,
				start_offset_seconds: program.startOffsetSeconds,
				episode_number: program.episodeNumber,
				subtitle: program.subtitle,
				program_comment: program.programComment,
				flags: program.flags,
				deleted: program.deleted,
				warning: program.warning,
				revision: program.revision,
				raw_data: program.raw,
				source_updated_at: toJstTimestamp(program.lastUpdate),
				imported_at: importedAt,
			})),
			"pid",
		);
	}
	if (programRange) {
		await saveBroadcastRoomSessions(
			supabase,
			roomSessionRows,
			programRange,
			animeRoomRows.map((anime) => anime.id),
		);
		await pruneExpiredSyobocalPrograms(supabase);
	}
	const sourceRows = mapping.selected.flatMap((proposal) => {
		const title = selectedTitleByTid.get(proposal.tid);
		if (!title) return [];
		const verifiedWikipedia = wikipedia.find(
			(candidate) => candidate.malId === proposal.malId && candidate.tid === proposal.tid,
		);
		const resources = verifiedWikipedia ? [{ name: "Wikipedia", url: verifiedWikipedia.sourceUrl }] : [];
		return [
			{
				mal_id: proposal.malId,
				source: "syobocal",
				source_version: title.lastUpdate ?? importedAt.slice(0, 10),
				source_url: `https://cal.syoboi.jp/tid/${title.tid}`,
				source_updated_at: dateOnly(title.lastUpdate),
				normalized_data: {
					syobocal_tid: title.tid,
					season,
					title: proposal.useForTitle ? title.title : null,
					title_ja: proposal.useForTitle ? title.title : null,
					title_yomi: proposal.useForTitle ? title.titleYomi : null,
					official_site_url: title.officialSiteUrl,
					official_x_url: title.officialXUrl,
					wikipedia_url: verifiedWikipedia?.sourceUrl ?? null,
					resources,
				},
				imported_at: importedAt,
			},
		];
	});
	await upsertBatches(supabase, "anime_source_records", sourceRows, "mal_id,source");
	const selectedMalIds = new Set(mapping.selected.map((proposal) => proposal.malId));
	const staleMalIds = malIds.filter((malId) => !selectedMalIds.has(malId));
	for (let start = 0; start < staleMalIds.length; start += DATABASE_BATCH_SIZE) {
		const { error } = await supabase
			.from("anime_source_records")
			.delete()
			.eq("source", "syobocal")
			.in("mal_id", staleMalIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) throw new Error(`Could not remove stale Syobocal source records: ${error.message}`);
	}
	console.log(`Saved Syobocal snapshots and ${mapping.selected.length} resolved source records.`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
