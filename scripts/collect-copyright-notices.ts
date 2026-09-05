import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Collect anime copyright notices (© lines) from resolved official sites.
// Candidates go to a review file; --apply additionally fills anime.copyright,
// but only where the column is still empty AND exactly one clean candidate
// was found. Ambiguous pages always stay manual.

const OUTPUT_DIRECTORY = join(process.cwd(), ".copyright-cache");
const REQUEST_INTERVAL_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;
const DATABASE_BATCH_SIZE = 500;
const MAX_CANDIDATE_LENGTH = 160;
const MIN_CANDIDATE_LENGTH = 5;

type AnimeRow = {
	id: number;
	mal_id: number | null;
	title: string;
	season: string | null;
	official_site_url: string | null;
	copyright: string | null;
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
	all: boolean;
	limit: number | null;
	apply: boolean;
	includeFilled: boolean;
};

function parseArgs(argv: string[]): Options {
	const options: Options = { season: null, all: false, limit: null, apply: false, includeFilled: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--all") {
			options.all = true;
			continue;
		}
		if (arg === "--apply") {
			options.apply = true;
			continue;
		}
		if (arg === "--include-filled") {
			options.includeFilled = true;
			continue;
		}
		if (arg === "--season" && next) {
			if (!/^\d{4}-(winter|spring|summer|fall)$/.test(next)) {
				throw new Error(`Invalid season (expected e.g. 2025-fall): ${next}`);
			}
			options.season = next;
			index += 1;
			continue;
		}
		if (arg === "--limit" && next) {
			options.limit = Number.parseInt(next, 10);
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!options.all && !options.season) {
		throw new Error(
			"Usage: pnpm collect:copyright -- (--season 2025-fall | --all) [--limit N] [--apply] [--include-filled]",
		);
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
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTargets(supabase: ReturnType<typeof getSupabaseClient>, options: Options): Promise<AnimeRow[]> {
	const rows: AnimeRow[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		let query = supabase
			.from("anime")
			.select("id,mal_id,title,season,official_site_url,copyright")
			.not("official_site_url", "is", null)
			.order("id", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (options.season) query = query.eq("season", options.season);
		if (!options.includeFilled) query = query.is("copyright", null);
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

function decodeEntities(value: string): string {
	return value
		.replaceAll("&copy;", "©")
		.replaceAll("&amp;", "&")
		.replaceAll("&nbsp;", " ")
		.replaceAll("&quot;", '"')
		.replaceAll("&#169;", "©")
		.replaceAll("&#xa9;", "©");
}

const COPYRIGHT_MARKER = /©|Ⓒ|\(C\)|（C）/;

function extractCandidates(html: string): string[] {
	const text = decodeEntities(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|li|footer|td|h[1-6]|section|article)>/gi, "\n")
			.replace(/<[^>]+>/g, " "),
	);
	const candidates = new Set<string>();
	for (const rawLine of text.split(/\n+/)) {
		const line = rawLine.replace(/\s+/g, " ").trim();
		if (!line || !COPYRIGHT_MARKER.test(line)) continue;
		// Trim leading noise before the marker, keep from the marker onward.
		const markerIndex = line.search(COPYRIGHT_MARKER);
		const candidate = line.slice(markerIndex).trim();
		if (candidate.length < MIN_CANDIDATE_LENGTH || candidate.length > MAX_CANDIDATE_LENGTH) continue;
		candidates.add(candidate);
	}
	return [...candidates];
}

async function fetchOfficialPage(url: string): Promise<{ html: string | null; status: number | null }> {
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; AnipolisCopyrightCollector/1.0)",
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

async function applyCopyright(
	supabase: ReturnType<typeof getSupabaseClient>,
	animeId: number,
	value: string,
): Promise<boolean> {
	// Guarded update: only fills a still-empty column, never overwrites.
	const { data, error } = await supabase
		.from("anime")
		.update({ copyright: value })
		.eq("id", animeId)
		.is("copyright", null)
		.select("id");
	if (error) throw new Error(`Could not update anime ${animeId}: ${error.message}`);
	return (data ?? []).length > 0;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();
	const targets = await fetchTargets(supabase, options);
	const scope = options.season ?? "all";
	console.log(
		`Targets with an official site${options.includeFilled ? "" : " and no copyright yet"}: ${targets.length}`,
	);

	const results: CollectionResult[] = [];
	let applied = 0;
	for (const [index, anime] of targets.entries()) {
		const url = anime.official_site_url as string;
		console.log(`[${index + 1}/${targets.length}] ${anime.title} — ${url}`);
		const { html, status } = await fetchOfficialPage(url);
		const candidates = html ? extractCandidates(html) : [];
		const result: CollectionResult = {
			anime_id: anime.id,
			mal_id: anime.mal_id,
			title: anime.title,
			season: anime.season,
			official_site_url: url,
			status: html === null ? "fetch_failed" : candidates.length === 0 ? "no_candidates" : "ok",
			http_status: status,
			candidates,
			applied: null,
		};

		if (options.apply && anime.copyright === null && candidates.length === 1) {
			const value = candidates[0] as string;
			if (await applyCopyright(supabase, anime.id, value)) {
				result.applied = value;
				applied += 1;
				console.log(`  applied: ${value}`);
			}
		}
		results.push(result);
		await sleep(REQUEST_INTERVAL_MS);
	}

	await mkdir(OUTPUT_DIRECTORY, { recursive: true });
	const jsonPath = join(OUTPUT_DIRECTORY, `${scope}.json`);
	await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
	const tsvPath = join(OUTPUT_DIRECTORY, `${scope}.tsv`);
	const tsv = [
		"mal_id\ttitle\tstatus\tapplied\tcandidates\tofficial_site_url",
		...results.map((r) =>
			[r.mal_id ?? "", r.title, r.status, r.applied ?? "", r.candidates.join(" ⏐ "), r.official_site_url].join(
				"\t",
			),
		),
	].join("\n");
	await writeFile(tsvPath, `${tsv}\n`, "utf8");

	const ok = results.filter((r) => r.status === "ok").length;
	const single = results.filter((r) => r.candidates.length === 1).length;
	const multi = results.filter((r) => r.candidates.length > 1).length;
	const failed = results.filter((r) => r.status === "fetch_failed").length;
	const empty = results.filter((r) => r.status === "no_candidates").length;
	console.log(`\nDone. pages with candidates: ${ok} (single: ${single}, multiple: ${multi})`);
	console.log(`fetch failed: ${failed}, no candidates: ${empty}`);
	if (options.apply) console.log(`applied to empty copyright columns: ${applied}`);
	console.log(`review files: ${jsonPath} / ${tsvPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
