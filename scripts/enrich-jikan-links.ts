import { createClient } from "@supabase/supabase-js";

// Per-ID link enrichment against a (self-hosted) Jikan instance.
// The season-page-driven Jikan import never sees entries that are missing from
// MAL's seasonal listings (MVs, CMs, late additions like ゆるゆる図鑑), so their
// MAL-page external links are fetched here directly: /anime/{id}/full for every
// catalog entry still lacking an official site or X URL, merged into the jikan
// source record (created when absent). Run the catalog resolver afterwards.
// Usage: pnpm enrich:jikan-links -- [--limit N]

const REQUEST_INTERVAL_MS = 1100;
const DATABASE_BATCH_SIZE = 500;
const JIKAN_BASE = process.env["JIKAN_BASE_URL"] ?? "http://localhost:8080/v4";

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) throw new Error("Set PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
}

type ExternalLink = { name?: string; url?: string };

// Mirror the Jikan season importer's exclusion rules: Music/PV/CM entries are
// never enriched, and entries whose links point at blocked resources are
// skipped entirely.
const BLOCKED_ANIME_TYPES = new Set(["Music", "PV", "CM"]);
const BLOCKED_RESOURCE_KEYWORDS = ["namuwiki", "bangumi"];

function hasBlockedResource(links: ExternalLink[]): boolean {
	return links.some((link) => {
		const searchableText = `${link.name ?? ""} ${link.url ?? ""}`.toLowerCase();
		return BLOCKED_RESOURCE_KEYWORDS.some((keyword) => searchableText.includes(keyword));
	});
}

function findOfficialSiteUrl(links: ExternalLink[]): string | null {
	return (
		links.find((link) => {
			const label = (link.name ?? "").trim().toLowerCase();
			return label.includes("official site") && Boolean(link.url);
		})?.url ?? null
	);
}

function findOfficialXUrl(links: ExternalLink[]): string | null {
	return (
		links.find((link) => {
			if (!link.url) return false;
			try {
				const hostname = new URL(link.url).hostname.toLowerCase();
				return hostname === "x.com" || hostname === "twitter.com" || hostname.endsWith(".twitter.com");
			} catch {
				return false;
			}
		})?.url ?? null
	);
}

async function main() {
	const limitArg = process.argv.indexOf("--limit");
	const limit = limitArg >= 0 ? Number.parseInt(process.argv[limitArg + 1] ?? "", 10) || null : null;
	const supabase = getSupabaseClient();

	type AnimeRow = {
		mal_id: number;
		type: string | null;
		official_site_url: string | null;
		official_x_url: string | null;
	};
	const animeRows: AnimeRow[] = [];
	for (let start = 0; ; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select("mal_id,type,official_site_url,official_x_url")
			.not("mal_id", "is", null)
			.or("official_site_url.is.null,official_x_url.is.null")
			.order("mal_id", { ascending: true })
			.range(start, start + DATABASE_BATCH_SIZE - 1);
		if (error) throw new Error(`Could not read anime rows: ${error.message}`);
		animeRows.push(
			...((data ?? []) as AnimeRow[]).filter((row) => !row.type || !BLOCKED_ANIME_TYPES.has(row.type)),
		);
		if (!data || data.length < DATABASE_BATCH_SIZE) break;
	}
	const scoped = limit ? animeRows.slice(0, limit) : animeRows;
	console.log(`Targets missing a site or X URL: ${animeRows.length}; processing ${scoped.length} via ${JIKAN_BASE}`);

	let siteApplied = 0;
	let xApplied = 0;
	let noLinks = 0;
	let failed = 0;
	for (const [index, anime] of scoped.entries()) {
		try {
			const response = await fetch(`${JIKAN_BASE}/anime/${anime.mal_id}/full`, {
				signal: AbortSignal.timeout(30000),
			});
			if (!response.ok) {
				failed += 1;
			} else {
				const payload = (await response.json()) as { data?: { external?: ExternalLink[] } };
				const external = payload.data?.external ?? [];
				if (hasBlockedResource(external)) {
					noLinks += 1;
					await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
					continue;
				}
				const site = anime.official_site_url ? null : findOfficialSiteUrl(external);
				const x = anime.official_x_url ? null : findOfficialXUrl(external);
				if (!site && !x) {
					noLinks += 1;
				} else {
					const { data: existing } = await supabase
						.from("anime_source_records")
						.select("normalized_data")
						.eq("mal_id", anime.mal_id)
						.eq("source", "jikan")
						.maybeSingle();
					const normalized = {
						...((existing?.normalized_data as Record<string, unknown>) ?? { mal_id: anime.mal_id }),
					};
					if (site && !normalized["official_site_url"]) {
						normalized["official_site_url"] = site;
						siteApplied += 1;
					}
					if (x && !normalized["official_x_url"]) {
						normalized["official_x_url"] = x;
						xApplied += 1;
					}
					const { error } = await supabase.from("anime_source_records").upsert(
						{
							mal_id: anime.mal_id,
							source: "jikan",
							source_version: "v4",
							source_url: `https://api.jikan.moe/v4/anime/${anime.mal_id}/full`,
							source_updated_at: null,
							normalized_data: normalized,
							imported_at: new Date().toISOString(),
						},
						{ onConflict: "mal_id,source" },
					);
					if (error) throw new Error(error.message);
				}
			}
		} catch (error) {
			failed += 1;
			console.warn(`MAL ${anime.mal_id}: ${String(error)}`);
		}
		if ((index + 1) % 100 === 0) {
			console.log(
				`Processed ${index + 1}/${scoped.length} (site ${siteApplied}, x ${xApplied}, none ${noLinks}, failed ${failed})`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
	}
	console.log(`Done. site=${siteApplied} x=${xApplied} no-links=${noLinks} failed=${failed}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
