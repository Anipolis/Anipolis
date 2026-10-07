import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { classifyLink } from "../src/lib/link-check.ts";
import { fetchWithRetry } from "../src/lib/utils/http-retry.ts";

// check:official-links の結果のうち、閉鎖・乗っ取りの公式サイトを Wayback Machine の
// 放送当時のアーカイブに差し替える。アーカイブが無い（または当時の時点で既に売却・
// スパムだった）ものはリンクを外す。どちらも manual ソースに記録し、週次のカタログ
// 再解決で古い URL に戻らないようにする。
//   pnpm replace:dead-official-links -- --review .link-check-cache/official-links-2026-10-07.json
//     [--keep-url <url>]... [--keep-host <host>]... [--dry-run]
// --keep-url / --keep-host は、点検で疑いになったが問題ないと確認したもの（誤検出）。
// archive.org へは1秒に1回まで。LOCAL ONLY。

const WAYBACK_API = "https://archive.org/wayback/available";
const REQUEST_INTERVAL_MS = 1000;
const SNAPSHOT_TIMEOUT_MS = 30000;
// 放送からこれより後のアーカイブは、閉鎖・乗っ取りの後に撮られたかもしれないので中身を確かめる
const TRUSTED_SNAPSHOT_YEARS = 2;

type ReviewRow = {
	url: string;
	status: string;
	reason: string;
	anime: { id: number; title: string; season: string | null }[];
};

type Options = { review: string; keepUrls: Set<string>; keepHosts: Set<string>; dryRun: boolean };

type Decision = {
	url: string;
	reason: string;
	anime_ids: number[];
	titles: string[];
	replacement: string | null;
	note: string;
};

function parseArgs(argv: string[]): Options {
	const options: Options = { review: "", keepUrls: new Set(), keepHosts: new Set(), dryRun: false };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--review" && next) {
			options.review = next;
			index += 1;
			continue;
		}
		if (arg === "--keep-url" && next) {
			options.keepUrls.add(next);
			index += 1;
			continue;
		}
		if (arg === "--keep-host" && next) {
			options.keepHosts.add(next.toLowerCase());
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!options.review) {
		throw new Error(
			"Usage: pnpm replace:dead-official-links -- --review <official-links-*.json> [--keep-url <url>] [--keep-host <host>] [--dry-run]",
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

/** シーズンの中ほど（放送中）の時刻。"2014-fall" → "20141101" */
function seasonTimestamp(season: string | null): string {
	const match = season?.match(/^(\d{4})-(winter|spring|summer|fall)$/);
	if (!match) return "20150101";
	const month = { winter: "02", spring: "05", summer: "08", fall: "11" }[match[2] as string];
	return `${match[1]}${month}01`;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return "";
	}
}

async function findSnapshot(url: string, timestamp: string): Promise<{ url: string; timestamp: string } | null> {
	const response = await fetchWithRetry(
		`${WAYBACK_API}?url=${encodeURIComponent(url)}&timestamp=${timestamp}`,
		{ headers: { "User-Agent": "Mozilla/5.0 (compatible; AnipolisLinkCheck/1.0)" } },
		{ timeoutMs: SNAPSHOT_TIMEOUT_MS },
	);
	if (!response.ok) return null;
	const body = (await response.json()) as {
		archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string; status?: string } };
	};
	const closest = body.archived_snapshots?.closest;
	if (!closest?.available || !closest.url || !closest.timestamp || closest.status !== "200") return null;
	return { url: closest.url.replace(/^http:\/\//, "https://"), timestamp: closest.timestamp };
}

/** アーカイブの中身が売却・スパム・「見つかりません」ページでないか */
async function snapshotLooksValid(snapshotUrl: string, titles: string[]): Promise<boolean> {
	try {
		const response = await fetch(snapshotUrl, { signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS) });
		const html = await response.text();
		const pageTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
		const bodyText = html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.slice(0, 20000);
		const verdict = classifyLink({
			url: snapshotUrl,
			finalUrl: null,
			httpStatus: response.status,
			errorCode: null,
			pageTitle,
			bodyText,
			animeTitles: titles,
		});
		return verdict.status === "ok";
	} catch {
		return false;
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();
	const review = JSON.parse(await readFile(options.review, "utf8")) as ReviewRow[];
	const targets = review.filter(
		(row) =>
			(row.status === "dead" || row.status === "suspicious") &&
			!options.keepUrls.has(row.url) &&
			!options.keepHosts.has(hostOf(row.url)),
	);
	console.log(`Targets: ${targets.length} URLs (${targets.reduce((sum, row) => sum + row.anime.length, 0)} anime)`);

	const decisions: Decision[] = [];
	for (const [index, row] of targets.entries()) {
		const seasons = row.anime.map((anime) => anime.season).filter((season): season is string => Boolean(season));
		const earliest = seasons.sort()[0] ?? null;
		const titles = row.anime.map((anime) => anime.title);
		const wanted = seasonTimestamp(earliest);
		let replacement: string | null = null;
		let note = "アーカイブなし";
		const snapshot = await findSnapshot(row.url, wanted).catch(() => null);
		await sleep(REQUEST_INTERVAL_MS);
		if (snapshot) {
			const yearsAfter = Number(snapshot.timestamp.slice(0, 4)) - Number(wanted.slice(0, 4));
			// 乗っ取り・転送の疑いがあったもの、放送から遠いアーカイブは中身を確かめる
			const needsCheck = row.status === "suspicious" || yearsAfter > TRUSTED_SNAPSHOT_YEARS || yearsAfter < -1;
			if (!needsCheck || (await snapshotLooksValid(snapshot.url, titles))) {
				replacement = snapshot.url;
				note = `アーカイブ ${snapshot.timestamp.slice(0, 8)}`;
			} else {
				note = `アーカイブ ${snapshot.timestamp.slice(0, 8)} は売却・スパム等のため不採用`;
			}
			if (needsCheck) await sleep(REQUEST_INTERVAL_MS);
		}
		decisions.push({
			url: row.url,
			reason: row.reason,
			anime_ids: row.anime.map((anime) => anime.id),
			titles,
			replacement,
			note,
		});
		if ((index + 1) % 50 === 0) console.log(`  ${index + 1}/${targets.length}`);
	}

	let updatedAnime = 0;
	if (!options.dryRun) {
		for (const decision of decisions) {
			for (const animeId of decision.anime_ids) {
				// 点検の後に誰かが直した URL は上書きしない
				const { data, error } = await supabase
					.from("anime")
					.update({ official_site_url: decision.replacement })
					.eq("id", animeId)
					.eq("official_site_url", decision.url)
					.select("mal_id");
				if (error) throw new Error(`Could not update anime ${animeId}: ${error.message}`);
				const malId = (data?.[0] as { mal_id: number | null } | undefined)?.mal_id;
				if (!data?.length) continue;
				updatedAnime += 1;
				if (malId == null) continue;
				const { data: manual, error: readError } = await supabase
					.from("anime_source_records")
					.select("normalized_data,source_url")
					.eq("mal_id", malId)
					.eq("source", "manual")
					.maybeSingle();
				if (readError) throw new Error(`Could not read manual record ${malId}: ${readError.message}`);
				const { error: upsertError } = await supabase.from("anime_source_records").upsert(
					{
						mal_id: malId,
						source: "manual",
						source_version: new Date().toISOString().slice(0, 10),
						source_url:
							(manual?.source_url as string | undefined) ?? `https://myanimelist.net/anime/${malId}`,
						normalized_data: {
							...((manual?.normalized_data as Record<string, unknown> | undefined) ?? { mal_id: malId }),
							official_site_url: decision.replacement,
						},
					},
					{ onConflict: "mal_id,source" },
				);
				if (upsertError) throw new Error(`Could not save manual record ${malId}: ${upsertError.message}`);
			}
		}
	}

	const outPath = options.review.replace(/\.json$/, "-replacements.json");
	await writeFile(outPath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
	const replaced = decisions.filter((decision) => decision.replacement).length;
	console.log(
		`\nDone${options.dryRun ? " (dry run, nothing written)" : ""}. archived: ${replaced}, removed: ${decisions.length - replaced}${options.dryRun ? "" : `, anime updated: ${updatedAnime}`}`,
	);
	console.log(`decisions: ${outPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
