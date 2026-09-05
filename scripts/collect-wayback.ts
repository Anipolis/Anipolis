import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Recover copyright notices and official X links for dead official sites
// (fetch_failed in earlier passes) from Wayback Machine snapshots taken close
// to the work's season. --apply behaves like the other collectors: single
// clean candidates only, guarded writes.

const OUTPUT_DIRECTORY = join(process.cwd(), ".x-cache");
const REQUEST_INTERVAL_MS = 1500;
const FETCH_TIMEOUT_MS = 30000;

type WaybackResult = {
	mal_id: number;
	title: string;
	season: string | null;
	url: string;
	snapshot: string | null;
	status: "ok" | "no_snapshot" | "fetch_failed";
	x_candidates: string[];
	x_applied: string | null;
	copyright_candidates: string[];
	copyright_applied: string | null;
};

function parseArgs(argv: string[]) {
	const options = { apply: false, limit: null as number | null };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--") continue;
		if (arg === "--apply") options.apply = true;
		else if (arg === "--limit" && argv[index + 1]) {
			options.limit = Number.parseInt(argv[index + 1] as string, 10) || null;
			index += 1;
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) throw new Error("Set PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
}

const RESERVED_PATHS = new Set([
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
]);
const CORPORATE_HANDLE =
	/^(tv_?tokyo|tx_|toei|shopro|shueisha|kadokawa|kodansha|shogakukan|nhk|bandai|banda?inamco|aniplex|avex|ponycanyon|kingrecords|mbs|tbs|ytv|fujitv|ntv|tvasahi|animax|at_x|bs11|wowow|abema|danime|netflixjp|primevideo|crunchyroll|youtube|line_?official|dlsite|internetarchive|waybackmachine)/i;

function extractHandles(html: string): { handles: string[]; corporate: string[] } {
	const counts = new Map<string, number>();
	// Wayback rewrites links as /web/<ts>/https://twitter.com/... — the regex
	// below matches the embedded original URL either way.
	for (const match of html.matchAll(
		/https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{2,15})(?=[/"'?#&\s<)\\]|$)/g,
	)) {
		const key = (match[1] as string).toLowerCase();
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

const COPYRIGHT_MARKER = /©|Ⓒ|\(C\)|（C）/;

function decodeEntities(value: string): string {
	return value
		.replaceAll("&copy;", "©")
		.replaceAll("&amp;", "&")
		.replaceAll("&nbsp;", " ")
		.replaceAll("&quot;", '"')
		.replaceAll("&#169;", "©")
		.replaceAll("&#xa9;", "©");
}

function extractCopyrightCandidates(html: string): string[] {
	// Strip the Wayback toolbar before parsing so its markup never contributes.
	const withoutToolbar = html
		.replace(/<div id="wm-ipp-base"[\s\S]*?<\/div><\/div><\/div>/i, " ")
		.replace(/<!-- BEGIN WAYBACK TOOLBAR INSERT -->[\s\S]*?<!-- END WAYBACK TOOLBAR INSERT -->/i, " ");
	const text = decodeEntities(
		withoutToolbar
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|li|footer|td|h[1-6]|section|article|span)>/gi, "\n")
			.replace(/<[^>]+>/g, " "),
	);
	const candidates = new Set<string>();
	for (const rawLine of text.split(/\n+/)) {
		const line = rawLine.replace(/\s+/g, " ").trim();
		if (!line || !COPYRIGHT_MARKER.test(line)) continue;
		if (/internet archive|wayback/i.test(line)) continue;
		const markerIndex = line.search(COPYRIGHT_MARKER);
		const candidate = line.slice(markerIndex).trim();
		if (candidate.length < 5 || candidate.length > 160) continue;
		candidates.add(candidate);
	}
	return [...candidates];
}

function seasonTimestamp(season: string | null): string {
	const match = season?.match(/^(\d{4})-(winter|spring|summer|fall)$/);
	if (!match) return "20210101";
	const month = { winter: "02", spring: "05", summer: "08", fall: "11" }[match[2] as string];
	return `${match[1]}${month}01`;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
	try {
		return await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "User-Agent": "Mozilla/5.0 (compatible; AnipolisArchiveCollector/1.0)" },
		});
	} catch {
		return null;
	}
}

async function applyOfficialXUrl(supabase: ReturnType<typeof getSupabaseClient>, malId: number, url: string) {
	const { data: existing } = await supabase
		.from("anime_source_records")
		.select("normalized_data")
		.eq("mal_id", malId)
		.eq("source", "manual")
		.maybeSingle();
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
	if (error) throw new Error(`manual record for MAL ${malId}: ${error.message}`);
	return true;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();

	// fetch_failed mal_ids from both earlier passes
	const failedIds = new Set<number>();
	try {
		const tsv = (await readFile(join(process.cwd(), ".copyright-cache", "all.tsv"), "utf8")).split("\n");
		const header = (tsv[0] as string).split("\t");
		const statusIdx = header.indexOf("status");
		const malIdx = header.indexOf("mal_id");
		for (const line of tsv.slice(1)) {
			const cols = line.split("\t");
			if (cols[statusIdx] === "fetch_failed") failedIds.add(Number(cols[malIdx]));
		}
	} catch {}
	try {
		const rows = JSON.parse(await readFile(join(OUTPUT_DIRECTORY, "x-links.json"), "utf8"));
		for (const row of rows) if (row.status === "fetch_failed" && row.mal_id) failedIds.add(row.mal_id);
	} catch {}

	const malIds = [...failedIds];
	const targets: {
		anime_id: number;
		mal_id: number;
		title: string;
		season: string | null;
		url: string;
		needX: boolean;
		needCopyright: boolean;
	}[] = [];
	for (let start = 0; start < malIds.length; start += 200) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,mal_id,title,season,official_site_url,official_x_url,copyright")
			.in("mal_id", malIds.slice(start, start + 200));
		if (error) throw new Error(`Could not read anime rows: ${error.message}`);
		for (const row of data ?? []) {
			if (!row.official_site_url || row.official_site_url.includes("web.archive.org")) continue;
			const needX = !row.official_x_url;
			const needCopyright = !row.copyright;
			if (!needX && !needCopyright) continue;
			targets.push({
				anime_id: row.id,
				mal_id: row.mal_id,
				title: row.title,
				season: row.season,
				url: row.official_site_url,
				needX,
				needCopyright,
			});
		}
	}
	const limited = options.limit ? targets.slice(0, options.limit) : targets;
	console.log(`Wayback targets: ${limited.length}${options.apply ? " (apply mode)" : ""}`);
	await mkdir(OUTPUT_DIRECTORY, { recursive: true });

	const results: WaybackResult[] = [];
	let xApplied = 0;
	let cpApplied = 0;
	for (const [index, target] of limited.entries()) {
		const result: WaybackResult = {
			mal_id: target.mal_id,
			title: target.title,
			season: target.season,
			url: target.url,
			snapshot: null,
			status: "no_snapshot",
			x_candidates: [],
			x_applied: null,
			copyright_candidates: [],
			copyright_applied: null,
		};
		const avail = await fetchWithTimeout(
			`https://archive.org/wayback/available?url=${encodeURIComponent(target.url)}&timestamp=${seasonTimestamp(target.season)}`,
		);
		const snapshot = avail?.ok ? (await avail.json())?.archived_snapshots?.closest : null;
		if (snapshot?.available && snapshot.url) {
			result.snapshot = String(snapshot.url).replace(/^http:/, "https:");
			const page = await fetchWithTimeout(result.snapshot);
			if (page?.ok) {
				const html = await page.text();
				result.status = "ok";
				if (target.needX) {
					const { handles, corporate } = extractHandles(html);
					result.x_candidates = [...handles, ...corporate].map((handle) => `https://x.com/${handle}`);
					if (options.apply && handles.length === 1 && corporate.length === 0) {
						const xUrl = `https://x.com/${handles[0]}`;
						if (await applyOfficialXUrl(supabase, target.mal_id, xUrl)) {
							result.x_applied = xUrl;
							xApplied += 1;
						}
					}
				}
				if (target.needCopyright) {
					result.copyright_candidates = extractCopyrightCandidates(html);
					if (options.apply && result.copyright_candidates.length === 1) {
						const { data } = await supabase
							.from("anime")
							.update({ copyright: result.copyright_candidates[0] })
							.eq("id", target.anime_id)
							.is("copyright", null)
							.select("id");
						if ((data ?? []).length > 0) {
							result.copyright_applied = result.copyright_candidates[0] as string;
							cpApplied += 1;
						}
					}
				}
			} else {
				result.status = "fetch_failed";
			}
		}
		results.push(result);
		if ((index + 1) % 20 === 0)
			console.log(`Processed ${index + 1}/${limited.length} (X ${xApplied}, © ${cpApplied})`);
		await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
	}

	await writeFile(join(OUTPUT_DIRECTORY, "wayback-pass.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
	const counts = { ok: 0, no_snapshot: 0, fetch_failed: 0 };
	for (const row of results) counts[row.status] += 1;
	console.log(
		`Done. ok=${counts.ok} no_snapshot=${counts.no_snapshot} fetch_failed=${counts.fetch_failed} x_applied=${xApplied} cp_applied=${cpApplied}`,
	);
	console.log(`Results: ${join(OUTPUT_DIRECTORY, "wayback-pass.json")}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
