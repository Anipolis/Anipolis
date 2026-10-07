import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { classifyLink, type LinkCheckStatus } from "../src/lib/link-check.ts";

// 公式サイトのリンク点検。anime.official_site_url を1件ずつ開き、閉鎖・乗っ取りを分類して
// レビュー用ファイル（.link-check-cache/）に出す。DB は変更しない（反映は別手順）。
//   pnpm check:official-links [-- --limit 100] [--before-season 2020-winter]
// 同じドメインへは1秒に1回まで、別ドメインは最大8件を並行して確認する。応答なし・5xx は
// 最後にもう一度だけ確認し直す。LOCAL ONLY（外部サイト巡回系と同じく CI では実行しない）。

const OUTPUT_DIRECTORY = join(process.cwd(), ".link-check-cache");
const HOST_CONCURRENCY = 8;
const SAME_HOST_INTERVAL_MS = 1000;
const FETCH_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 256 * 1024;
const PAGE_SIZE = 1000;

type AnimeRow = {
	id: number;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	season: string | null;
	official_site_url: string;
	metadata_ready: boolean;
};

type CheckResult = {
	url: string;
	status: LinkCheckStatus;
	reason: string;
	http_status: number | null;
	final_url: string | null;
	page_title: string;
	anime: { id: number; title: string; season: string | null; public: boolean }[];
};

type Options = { limit: number | null; beforeSeason: string | null };

function parseArgs(argv: string[]): Options {
	const options: Options = { limit: null, beforeSeason: null };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--limit" && next) {
			options.limit = Number.parseInt(next, 10);
			index += 1;
			continue;
		}
		if (arg === "--before-season" && next) {
			options.beforeSeason = next;
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
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCappedBody(response: Response): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (total < MAX_BODY_BYTES) {
		const { done, value } = await reader.read();
		if (done || !value) break;
		chunks.push(value);
		total += value.length;
	}
	await reader.cancel().catch(() => {});
	const body = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
	let offset = 0;
	for (const chunk of chunks) {
		const slice = chunk.subarray(0, Math.max(0, body.length - offset));
		body.set(slice, offset);
		offset += slice.length;
	}
	return body;
}

function decodeBody(bytes: Uint8Array, contentType: string | null): string {
	const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, 4096)).toLowerCase();
	const charset =
		contentType?.match(/charset=([\w-]+)/i)?.[1] ??
		prefix.match(/<meta[^>]+charset=["']?([\w-]+)/)?.[1] ??
		prefix.match(/content=["'][^"']*charset=([\w-]+)/)?.[1] ??
		"utf-8";
	try {
		return new TextDecoder(charset.toLowerCase()).decode(bytes);
	} catch {
		return new TextDecoder("utf-8").decode(bytes);
	}
}

function errorCodeOf(error: unknown): string {
	if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"))
		return "TIMEOUT";
	const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
	if (cause?.code) return cause.code;
	if (error instanceof TypeError && /invalid url/i.test(error.message)) return "ERR_INVALID_URL";
	return cause?.message?.slice(0, 40) ?? (error instanceof Error ? error.name : "UNKNOWN");
}

async function checkUrl(url: string, rows: AnimeRow[]): Promise<CheckResult> {
	let httpStatus: number | null = null;
	let finalUrl: string | null = null;
	let errorCode: string | null = null;
	let pageTitle = "";
	let bodyText = "";
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; AnipolisLinkCheck/1.0)",
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "ja,en;q=0.8",
			},
		});
		httpStatus = response.status;
		finalUrl = response.url || url;
		const html = decodeBody(await readCappedBody(response), response.headers.get("content-type"));
		pageTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 200);
		bodyText = html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.slice(0, 20000);
	} catch (error) {
		errorCode = errorCodeOf(error);
	}
	const animeTitles = rows.flatMap((row) => [row.title, row.title_en, row.title_romaji].filter(Boolean) as string[]);
	const verdict = classifyLink({ url, finalUrl, httpStatus, errorCode, pageTitle, bodyText, animeTitles });
	return {
		url,
		status: verdict.status,
		reason: verdict.reason,
		http_status: httpStatus,
		final_url: finalUrl,
		page_title: pageTitle,
		anime: rows.map((row) => ({ id: row.id, title: row.title, season: row.season, public: row.metadata_ready })),
	};
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return url;
	}
}

/** ドメインごとに順番に、ドメインどうしは並行して確認する */
async function checkAll(urls: string[], rowsByUrl: Map<string, AnimeRow[]>, label: string): Promise<CheckResult[]> {
	const byHost = new Map<string, string[]>();
	for (const url of urls) byHost.set(hostOf(url), [...(byHost.get(hostOf(url)) ?? []), url]);
	// 件数の多いドメインから始めると、最後に1ドメインだけ残って待つ時間が減る
	const queue = [...byHost.values()].sort((left, right) => right.length - left.length);
	const results: CheckResult[] = [];
	let done = 0;
	const worker = async () => {
		for (let hostUrls = queue.shift(); hostUrls; hostUrls = queue.shift()) {
			for (const [index, url] of hostUrls.entries()) {
				if (index > 0) await sleep(SAME_HOST_INTERVAL_MS);
				results.push(await checkUrl(url, rowsByUrl.get(url) ?? []));
				done += 1;
				if (done % 250 === 0) console.log(`[${label}] ${done}/${urls.length}`);
			}
		}
	};
	await Promise.all(Array.from({ length: HOST_CONCURRENCY }, worker));
	return results;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const supabase = getSupabaseClient();
	const rows: AnimeRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,title,title_en,title_romaji,season,official_site_url,metadata_ready")
			.not("official_site_url", "is", null)
			.order("id")
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`Could not read anime rows: ${error.message}`);
		rows.push(...((data ?? []) as AnimeRow[]));
		if (!data || data.length < PAGE_SIZE) break;
	}
	const targetRows = options.beforeSeason
		? rows.filter((row) => (row.season ?? "9999") < (options.beforeSeason as string))
		: rows;
	const rowsByUrl = new Map<string, AnimeRow[]>();
	for (const row of targetRows) {
		rowsByUrl.set(row.official_site_url, [...(rowsByUrl.get(row.official_site_url) ?? []), row]);
	}
	// Wayback のアーカイブに差し替え済みの URL は変わらないので点検しない
	let urls = [...rowsByUrl.keys()].filter((url) => !/^https?:\/\/web\.archive\.org\//i.test(url));
	if (options.limit) urls = urls.slice(0, options.limit);
	console.log(
		`Checking ${urls.length} URLs (${targetRows.length} anime) across ${new Set(urls.map(hostOf)).size} hosts`,
	);

	const started = Date.now();
	const first = await checkAll(urls, rowsByUrl, "pass 1");
	const retryUrls = first.filter((result) => result.status === "retry").map((result) => result.url);
	console.log(
		`Pass 1 done in ${Math.round((Date.now() - started) / 60000)} min; rechecking ${retryUrls.length} URLs`,
	);
	await sleep(60_000);
	const second = new Map((await checkAll(retryUrls, rowsByUrl, "pass 2")).map((result) => [result.url, result]));
	const results = first.map((result) => {
		const recheck = second.get(result.url);
		if (!recheck) return result;
		// 2回とも応答が無いものは閉鎖とみなす
		return recheck.status === "retry"
			? { ...recheck, status: "dead" as const, reason: `${recheck.reason}（2回）` }
			: recheck;
	});

	await mkdir(OUTPUT_DIRECTORY, { recursive: true });
	const stamp = new Date().toISOString().slice(0, 10);
	const jsonPath = join(OUTPUT_DIRECTORY, `official-links-${stamp}.json`);
	await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
	const tsvPath = join(OUTPUT_DIRECTORY, `official-links-${stamp}.tsv`);
	const tsv = [
		"status\treason\thttp\turl\tfinal_url\tpage_title\tanime",
		...results
			.filter((result) => result.status !== "ok")
			.map((result) =>
				[
					result.status,
					result.reason,
					result.http_status ?? "",
					result.url,
					result.final_url ?? "",
					result.page_title,
					result.anime.map((anime) => `${anime.id}:${anime.title}`).join(" ⏐ "),
				].join("\t"),
			),
	].join("\n");
	await writeFile(tsvPath, `${tsv}\n`, "utf8");

	const count = (status: LinkCheckStatus) => results.filter((result) => result.status === status).length;
	console.log(
		`\nDone in ${Math.round((Date.now() - started) / 60000)} min. ok ${count("ok")}, dead ${count("dead")}, blocked ${count("blocked")}, suspicious ${count("suspicious")}`,
	);
	console.log(`review files: ${jsonPath} / ${tsvPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
