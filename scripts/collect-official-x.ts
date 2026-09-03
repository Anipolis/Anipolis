import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Collect official X (Twitter) profile links from resolved official sites.
// Candidates go to a review file; --apply additionally writes a manual source
// record (normalized_data.official_x_url) for rows that still have no X URL
// AND yielded exactly one clean candidate. Ambiguous pages stay manual.
// Corporate/broadcaster handles are never auto-applied.

const OUTPUT_DIRECTORY = join(process.cwd(), ".x-cache");
const REQUEST_INTERVAL_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;
const DATABASE_BATCH_SIZE = 500;

type AnimeRow = {
	id: number;
	mal_id: number | null;
	title: string;
	season: string | null;
	official_site_url: string | null;
	official_x_url: string | null;
};

type CollectionResult = {
	anime_id: number;
	mal_id: number | null;
	title: string;
	season: string | null;
	official_site_url: string;
	status: "ok" | "fetch_failed" | "no_candidates";
	http_status: number | null;
	candidates: string[];
	applied: string | null;
};

type Options = {
	season: string | null;
	limit: number | null;
	apply: boolean;
};

function parseArgs(argv: string[]): Options {
	const options: Options = { season: null, limit: null, apply: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--apply") {
			options.apply = true;
			continue;
		}
		if (arg === "--season" && next) {
			options.season = next;
			index += 1;
			continue;
		}
		if (arg === "--limit" && next) {
			options.limit = Number.parseInt(next, 10) || null;
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
}

async function fetchTargets(supabase: ReturnType<typeof getSupabaseClient>, options: Options): Promise<AnimeRow[]> {
	const rows: AnimeRow[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		let query = supabase
			.from("anime")
			.select("id,mal_id,title,season,official_site_url,official_x_url")
			.not("official_site_url", "is", null)
			.is("official_x_url", null)
			.order("id", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (options.season) query = query.eq("season", options.season);
		const { data, error } = await query;
		if (error) throw new Error(`Could not read anime rows: ${error.message}`);
		rows.push(...((data ?? []) as AnimeRow[]));
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	return options.limit ? rows.slice(0, options.limit) : rows;
}

function sniffCharset(bytes: Uint8Array, contentType: string | null): string {
	const headerMatch = contentType?.match(/charset=([\w-]+)/i);
	if (headerMatch?.[1]) return headerMatch[1].toLowerCase();
	const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, 4096)).toLowerCase();
	const metaMatch =
		prefix.match(/<meta[^>]+charset=["']?([\w-]+)/) ?? prefix.match(/content=["'][^"']*charset=([\w-]+)/);
	return metaMatch?.[1]?.toLowerCase() ?? "utf-8";
}

function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
	const charset = sniffCharset(bytes, contentType);
	try {
		return new TextDecoder(charset).decode(bytes);
	} catch {
		return new TextDecoder("utf-8").decode(bytes);
	}
}

// X path segments that are never profile handles.
const RESERVED_PATHS = new Set(
	[
		"intent",
		"share",
		"home",
		"search",
		"hashtag",
		"i",
		"login",
		"signup",
		"logout",
		"explore",
		"settings",
		"about",
		"privacy",
		"tos",
		"download",
		"widgets",
		"messages",
		"notifications",
		"compose",
		"account",
		"help",
		"jobs",
		"search-home",
		"javascripts",
	].map((value) => value.toLowerCase()),
);

// Broadcaster/publisher/platform handles: likely correct-looking but not the
// work's own account. Never auto-applied; surfaced as candidates instead.
const CORPORATE_HANDLE =
	/^(tv_?tokyo|tx_|telehikaru|toei|shopro|shueisha|kadokawa|kodansha|shogakukan|nhk|bandai|banda?inamco|aniplex|avex|ponycanyon|kingrecords|mbs|tbs|ytv|fujitv|ntv|tvasahi|animax|at_x|bs11|wowow|abema|danime|netflixjp|primevideo|crunchyroll|youtube|line_?official)/i;

function extractHandles(html: string): { handles: string[]; corporate: string[] } {
	const counts = new Map<string, number>();
	for (const match of html.matchAll(
		/https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{2,15})(?=[/"'?#&\s<)\\]|$)/g,
	)) {
		const handle = match[1];
		if (!handle) continue;
		const key = handle.toLowerCase();
		if (RESERVED_PATHS.has(key)) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const handles: string[] = [];
	const corporate: string[] = [];
	for (const [handle] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
		if (CORPORATE_HANDLE.test(handle)) corporate.push(handle);
		else handles.push(handle);
	}
	return { handles, corporate };
}

async function fetchOfficialPage(url: string): Promise<{ html: string | null; status: number | null }> {
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; AnipolisLinkCollector/1.0)",
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "ja,en;q=0.8",
			},
		});
		if (!response.ok) return { html: null, status: response.status };
		const bytes = new Uint8Array(await response.arrayBuffer());
		return { html: decodeHtml(bytes, response.headers.get("content-type")), status: response.status };
	} catch {
		return { html: null, status: null };
	}
}

async function applyOfficialXUrl(
	supabase: ReturnType<typeof getSupabaseClient>,
	malId: number,
	url: string,
): Promise<boolean> {
	// Manual source records win in the catalog resolver and survive re-imports.
	const { data: existing, error: readError } = await supabase
		.from("anime_source_records")
		.select("normalized_data")
		.eq("mal_id", malId)
		.eq("source", "manual")
		.maybeSingle();
	if (readError) throw new Error(`Could not read manual record for MAL ${malId}: ${readError.message}`);
	const normalized = { ...((existing?.normalized_data as Record<string, unknown>) ?? {}) };
	if (normalized["official_x_url"]) return false;
	normalized["official_x_url"] = url;
	const { error } = await supabase.from("anime_source_records").upsert(
		{
			mal_id: malId,
			source: "manual",
			source_version: new Date().toISOString().slice(0, 10),
			source_url: url,
			normalized_data: normalized,
			imported_at: new Date().toISOString(),
		},
		{ onConflict: "mal_id,source" },
	);
	if (error) throw new Error(`Could not upsert manual record for MAL ${malId}: ${error.message}`);
	return true;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();
	const targets = await fetchTargets(supabase, options);
	console.log(`Targets with an official site and no X URL: ${targets.length}${options.apply ? " (apply mode)" : ""}`);
	await mkdir(OUTPUT_DIRECTORY, { recursive: true });

	const results: CollectionResult[] = [];
	let applied = 0;
	for (const [index, anime] of targets.entries()) {
		const url = anime.official_site_url as string;
		const { html, status } = await fetchOfficialPage(url);
		let result: CollectionResult;
		if (!html) {
			result = {
				anime_id: anime.id,
				mal_id: anime.mal_id,
				title: anime.title,
				season: anime.season,
				official_site_url: url,
				status: "fetch_failed",
				http_status: status,
				candidates: [],
				applied: null,
			};
		} else {
			const { handles, corporate } = extractHandles(html);
			const all = [...handles, ...corporate];
			let appliedUrl: string | null = null;
			if (options.apply && handles.length === 1 && corporate.length === 0 && anime.mal_id) {
				const xUrl = `https://x.com/${handles[0]}`;
				if (await applyOfficialXUrl(supabase, anime.mal_id, xUrl)) {
					appliedUrl = xUrl;
					applied += 1;
				}
			}
			result = {
				anime_id: anime.id,
				mal_id: anime.mal_id,
				title: anime.title,
				season: anime.season,
				official_site_url: url,
				status: all.length ? "ok" : "no_candidates",
				http_status: status,
				candidates: all.map((handle) => `https://x.com/${handle}`),
				applied: appliedUrl,
			};
		}
		results.push(result);
		if ((index + 1) % 25 === 0) console.log(`Processed ${index + 1}/${targets.length} (applied ${applied})`);
		await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
	}

	const jsonPath = join(OUTPUT_DIRECTORY, "x-links.json");
	await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
	const tsv = [
		"mal_id\ttitle\tseason\tstatus\tapplied\tcandidates\tofficial_site_url",
		...results.map((row) =>
			[
				row.mal_id ?? "",
				row.title,
				row.season ?? "",
				row.status,
				row.applied ?? "",
				row.candidates.join(" ⏐ "),
				row.official_site_url,
			].join("\t"),
		),
	].join("\n");
	await writeFile(join(OUTPUT_DIRECTORY, "x-links.tsv"), `${tsv}\n`, "utf8");
	const counts = { ok: 0, no_candidates: 0, fetch_failed: 0 };
	for (const row of results) counts[row.status] += 1;
	const multi = results.filter((row) => row.status === "ok" && !row.applied && row.candidates.length > 0).length;
	console.log(
		`Done. ok=${counts.ok} no_candidates=${counts.no_candidates} fetch_failed=${counts.fetch_failed} applied=${applied} needs_review=${multi}`,
	);
	console.log(`Results: ${jsonPath}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
