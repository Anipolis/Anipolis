import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
	type CatalogSourceRecord,
	type LegacyAnimeCatalogRow,
	resolveAnimeCatalog,
} from "../src/lib/anime-catalog-resolver.ts";
import { buildAnimeDataAttributions } from "../src/lib/anime-data-attributions.ts";
import {
	annictTwitterUrl,
	copyrightComparisonKey,
	normalizeAnnictCopyright,
	normalizeAnnictOfficialSiteUrl,
} from "../src/lib/annict.ts";
import { fetchWithRetry } from "../src/lib/utils/http-retry.ts";

// Annict (api.annict.com GraphQL) から作品の公式サイト・X・画像の著作権表記を
// 取り込む。Annict はユーザー編集のデータベースなので、ほかのソースを置き換えない:
// - 公式URL/X は anime_source_records(source='annict') に保存し、リゾルバが
//   既存値の無い作品だけ埋める。anime 行へは、リゾルバの解決結果のうち出どころが
//   Annict になった公式URL/X だけを書き込む（resolve:anime-catalog 全体を流すと
//   無関係な項目の差分まで本番に入るため、ここでは項目を限定する）。
// - © は anime.copyright が空の作品だけ直接埋める。ただし同じ © がすでに別作品に
//   入っている場合（続編で Annict が1期の © のままになっている等）は保留にする。
//   シーズンは古い順に処理するので、シリーズ内では最初の作品に © が付く。
// - 既存 © と食い違う作品は見直し候補としてレビューファイルに出す（DBは変えない）。
//
// LOCAL ONLY. 外部サイト巡回系と同じく GitHub Actions からは実行しない。

const ANNICT_GRAPHQL_URL = "https://api.annict.com/graphql";
const OUTPUT_DIRECTORY = join(process.cwd(), ".annict-cache");
const REQUEST_INTERVAL_MS = 1000;
const PAGE_SIZE = 50;
const DATABASE_BATCH_SIZE = 200;
const SEASON_NAMES = ["winter", "spring", "summer", "fall"] as const;

const SEARCH_WORKS_QUERY = `query($seasons: [String!], $after: String) {
	searchWorks(seasons: $seasons, first: ${PAGE_SIZE}, after: $after, orderBy: { field: WATCHERS_COUNT, direction: DESC }) {
		pageInfo { hasNextPage endCursor }
		nodes { annictId title malAnimeId syobocalTid officialSiteUrl twitterUsername image { copyright } }
	}
}`;

type Options = { seasons: string[]; dryRun: boolean; allowShared: boolean };

type AnnictWork = {
	annictId: number;
	title: string;
	malAnimeId: string | null;
	syobocalTid: number | null;
	officialSiteUrl: string | null;
	twitterUsername: string | null;
	image: { copyright: string | null } | null;
};

type AnimeRow = { id: number; mal_id: number; title: string; season: string | null; copyright: string | null };

type CopyrightDecision = {
	anime_id: number;
	mal_id: number;
	title: string;
	season: string | null;
	annict_ids: number[];
	annict_copyright: string;
	existing_copyright: string | null;
	result: "applied" | "applied_shared" | "held_shared" | "held_ambiguous" | "mismatch";
	note: string | null;
};

function parseArgs(argv: string[]): Options {
	const seasons: string[] = [];
	let dryRun = false;
	let allowShared = false;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--") continue;
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--allow-shared") {
			allowShared = true;
			continue;
		}
		if (arg === "--season" && next) {
			if (!/^\d{4}-(winter|spring|summer|fall)$/.test(next)) throw new Error(`Invalid season: ${next}`);
			seasons.push(next);
			index += 1;
			continue;
		}
		if (arg === "--years" && next) {
			const match = next.match(/^(\d{4})-(\d{4})$/);
			if (!match) throw new Error(`Invalid year range (expected e.g. 1990-1999): ${next}`);
			for (let year = Number(match[1]); year <= Number(match[2]); year += 1) {
				for (const name of SEASON_NAMES) seasons.push(`${year}-${name}`);
			}
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (seasons.length === 0) {
		throw new Error(
			"Usage: pnpm import:annict -- (--season 2015-spring ... | --years 2010-2019) [--allow-shared] [--dry-run]",
		);
	}
	// 古い順に処理する（シリーズ内で最初の作品に © を付け、続編を保留にするため）
	return { seasons: [...new Set(seasons)].sort(compareSeasons), dryRun, allowShared };
}

function compareSeasons(left: string, right: string): number {
	const [leftYear, leftName] = left.split("-");
	const [rightYear, rightName] = right.split("-");
	if (leftYear !== rightYear) return Number(leftYear) - Number(rightYear);
	return (
		SEASON_NAMES.indexOf(leftName as (typeof SEASON_NAMES)[number]) -
		SEASON_NAMES.indexOf(rightName as (typeof SEASON_NAMES)[number])
	);
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

function getAnnictToken(): string {
	const token = process.env["ANNICT_ACCESS_TOKEN"];
	if (!token) throw new Error("Set ANNICT_ACCESS_TOKEN (issued at https://annict.com/settings/apps).");
	return token;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeasonWorks(token: string, season: string): Promise<AnnictWork[]> {
	const works: AnnictWork[] = [];
	let after: string | null = null;
	do {
		const response = await fetchWithRetry(ANNICT_GRAPHQL_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ query: SEARCH_WORKS_QUERY, variables: { seasons: [season], after } }),
		});
		if (!response.ok) throw new Error(`Annict ${season} request failed: HTTP ${response.status}`);
		const body = (await response.json()) as {
			data?: {
				searchWorks: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: AnnictWork[] };
			};
			errors?: unknown;
		};
		if (body.errors || !body.data) throw new Error(`Annict ${season} query failed: ${JSON.stringify(body.errors)}`);
		works.push(...body.data.searchWorks.nodes);
		after = body.data.searchWorks.pageInfo.hasNextPage ? body.data.searchWorks.pageInfo.endCursor : null;
		await sleep(REQUEST_INTERVAL_MS);
	} while (after);
	return works;
}

async function fetchAnimeByMalIds(
	supabase: ReturnType<typeof getSupabaseClient>,
	malIds: number[],
): Promise<AnimeRow[]> {
	const rows: AnimeRow[] = [];
	for (let start = 0; start < malIds.length; start += DATABASE_BATCH_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,mal_id,title,season,copyright")
			.in("mal_id", malIds.slice(start, start + DATABASE_BATCH_SIZE));
		if (error) throw new Error(`Could not read anime rows: ${error.message}`);
		rows.push(...((data ?? []) as AnimeRow[]));
	}
	return rows;
}

async function fetchExistingCopyrights(supabase: ReturnType<typeof getSupabaseClient>) {
	const byKey = new Map<string, { id: number; title: string }>();
	for (let start = 0; ; start += 1000) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,title,copyright")
			.not("copyright", "is", null)
			.order("id", { ascending: true })
			.range(start, start + 999);
		if (error) throw new Error(`Could not read existing copyrights: ${error.message}`);
		for (const row of data ?? []) {
			const key = copyrightComparisonKey(row.copyright as string);
			if (key && !byKey.has(key)) byKey.set(key, { id: row.id as number, title: row.title as string });
		}
		if (!data || data.length < 1000) break;
	}
	return byKey;
}

const LEGACY_COLUMNS =
	"id,mal_id,title,title_en,title_romaji,episode_count,type,status,aired_from,aired_to,season,source,studio,studio_en,genre,genre_en,broadcast_day,broadcast_time,broadcast_station,broadcast_duration_minutes,title_yomi,official_site_url,official_x_url,resources,cover_url,metadata_ready,room_type,room_type_source";
const LINK_FIELDS = ["official_site_url", "official_x_url"] as const;

/**
 * リゾルバの解決結果のうち Annict 由来になった公式URL/X だけを anime 行へ書き込み、
 * Annict の出典を公開する。空欄の列だけを更新する。
 */
async function applyAnnictLinks(
	supabase: ReturnType<typeof getSupabaseClient>,
	malIds: number[],
	dryRun: boolean,
): Promise<{ site: number; x: number }> {
	const counts = { site: 0, x: 0 };
	for (let start = 0; start < malIds.length; start += DATABASE_BATCH_SIZE) {
		const batch = malIds.slice(start, start + DATABASE_BATCH_SIZE);
		const [animeResult, recordResult] = await Promise.all([
			supabase.from("anime").select(LEGACY_COLUMNS).in("mal_id", batch),
			supabase
				.from("anime_source_records")
				.select("mal_id,source,source_url,normalized_data")
				.in("mal_id", batch),
		]);
		if (animeResult.error) throw new Error(`Could not read anime rows: ${animeResult.error.message}`);
		if (recordResult.error) throw new Error(`Could not read source records: ${recordResult.error.message}`);
		const records = (recordResult.data ?? []) as CatalogSourceRecord[];
		for (const row of (animeResult.data ?? []) as unknown as (LegacyAnimeCatalogRow & { id: number })[]) {
			const resolution = resolveAnimeCatalog(
				records.filter((record) => record.mal_id === row.mal_id),
				row,
			);
			const patch: Partial<Record<(typeof LINK_FIELDS)[number], string>> = {};
			for (const field of LINK_FIELDS) {
				const value = resolution.canonical[field];
				if (resolution.fieldSources[field]?.source === "annict" && value && row[field] === null)
					patch[field] = value;
			}
			if (Object.keys(patch).length === 0) continue;
			if (!dryRun) {
				let query = supabase.from("anime").update(patch).eq("id", row.id);
				for (const field of Object.keys(patch)) query = query.is(field, null);
				const { error } = await query;
				if (error) throw new Error(`Could not update anime ${row.id}: ${error.message}`);
			}
			if (patch.official_site_url) counts.site += 1;
			if (patch.official_x_url) counts.x += 1;
		}
		const attributions = buildAnimeDataAttributions(records.filter((record) => record.source === "annict"));
		if (!dryRun && attributions.length > 0) {
			const { error } = await supabase
				.from("anime_data_attributions")
				.upsert(attributions, { onConflict: "anime_mal_id,source" });
			if (error) throw new Error(`Could not save Annict attributions: ${error.message}`);
		}
	}
	return counts;
}

function firstValue<T>(values: (T | null)[]): T | null {
	return values.find((value) => value !== null) ?? null;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const token = getAnnictToken();
	const supabase = getSupabaseClient();
	const existingCopyrights = await fetchExistingCopyrights(supabase);
	const today = new Date().toISOString().slice(0, 10);
	const decisions: CopyrightDecision[] = [];
	let savedRecords = 0;
	const linkTotals = { site: 0, x: 0 };

	for (const season of options.seasons) {
		const works = await fetchSeasonWorks(token, season);
		const worksByMalId = new Map<number, AnnictWork[]>();
		for (const work of works) {
			const malId = Number.parseInt(work.malAnimeId ?? "", 10);
			if (!Number.isInteger(malId) || malId <= 0) continue;
			worksByMalId.set(malId, [...(worksByMalId.get(malId) ?? []), work]);
		}
		const animeRows = await fetchAnimeByMalIds(supabase, [...worksByMalId.keys()]);
		const knownMalIds = new Set(animeRows.map((row) => row.mal_id));

		const records = [...worksByMalId.entries()]
			.filter(([malId]) => knownMalIds.has(malId))
			.map(([malId, group]) => {
				const copyrights = [
					...new Map(
						group
							.map((work) => normalizeAnnictCopyright(work.image?.copyright))
							.filter((value): value is string => value !== null)
							.map((value) => [copyrightComparisonKey(value), value]),
					).values(),
				];
				return {
					mal_id: malId,
					source: "annict",
					source_version: today,
					source_url: `https://annict.com/works/${group[0]?.annictId}`,
					normalized_data: {
						annict_ids: group.map((work) => work.annictId),
						title: group[0]?.title ?? null,
						season,
						official_site_url: firstValue(
							group.map((work) => normalizeAnnictOfficialSiteUrl(work.officialSiteUrl)),
						),
						official_x_url: firstValue(group.map((work) => annictTwitterUrl(work.twitterUsername))),
						syobocal_tid: firstValue(group.map((work) => work.syobocalTid ?? null)),
						// 同じ MAL ID に複数の Annict 作品があり © が食い違う場合は採用しない
						copyright: copyrights.length === 1 ? copyrights[0] : null,
						copyright_candidates: copyrights,
					},
				};
			});

		if (!options.dryRun) {
			for (let start = 0; start < records.length; start += DATABASE_BATCH_SIZE) {
				const { error } = await supabase
					.from("anime_source_records")
					.upsert(records.slice(start, start + DATABASE_BATCH_SIZE), { onConflict: "mal_id,source" });
				if (error) throw new Error(`Could not save Annict source records: ${error.message}`);
			}
		}
		savedRecords += records.length;
		// dry-run ではソースレコードを保存しないので、解決結果は既存レコード基準の目安になる
		const links = await applyAnnictLinks(
			supabase,
			records.map((record) => record.mal_id),
			options.dryRun,
		);
		linkTotals.site += links.site;
		linkTotals.x += links.x;

		const recordByMalId = new Map(records.map((record) => [record.mal_id, record.normalized_data]));
		for (const anime of animeRows) {
			const record = recordByMalId.get(anime.mal_id);
			if (!record || record.copyright_candidates.length === 0) continue;
			const base = {
				anime_id: anime.id,
				mal_id: anime.mal_id,
				title: anime.title,
				season: anime.season,
				annict_ids: record.annict_ids,
				existing_copyright: anime.copyright,
			};
			if (record.copyright === null) {
				decisions.push({
					...base,
					annict_copyright: record.copyright_candidates.join(" ⏐ "),
					result: anime.copyright ? "mismatch" : "held_ambiguous",
					note: "複数の Annict 作品で © が食い違う",
				});
				continue;
			}
			const key = copyrightComparisonKey(record.copyright);
			if (anime.copyright) {
				if (copyrightComparisonKey(anime.copyright) !== key) {
					decisions.push({ ...base, annict_copyright: record.copyright, result: "mismatch", note: null });
				}
				continue;
			}
			const shared = existingCopyrights.get(key);
			const sharedNote =
				shared && shared.id !== anime.id ? `同じ © が既に入っている: ${shared.title} (id=${shared.id})` : null;
			// --allow-shared: シリーズ共通の © は入れてよい（運用判断 2026-10-06）。ただし続編で
			// Annict が1期の © のままのケースも混ざるので、applied_shared としてレビューに残す。
			if (sharedNote && !options.allowShared) {
				decisions.push({
					...base,
					annict_copyright: record.copyright,
					result: "held_shared",
					note: sharedNote,
				});
				continue;
			}
			if (!options.dryRun) {
				// 空欄のときだけ埋める（並行して誰かが入れた値は上書きしない）
				const { data, error } = await supabase
					.from("anime")
					.update({ copyright: record.copyright })
					.eq("id", anime.id)
					.is("copyright", null)
					.select("id");
				if (error) throw new Error(`Could not update anime ${anime.id}: ${error.message}`);
				if ((data ?? []).length === 0) continue;
			}
			if (!sharedNote) existingCopyrights.set(key, { id: anime.id, title: anime.title });
			decisions.push({
				...base,
				annict_copyright: record.copyright,
				result: sharedNote ? "applied_shared" : "applied",
				note: sharedNote,
			});
		}

		const seasonDecisions = decisions.filter((decision) => recordByMalId.has(decision.mal_id));
		const count = (result: CopyrightDecision["result"]) =>
			seasonDecisions.filter((decision) => decision.result === result).length;
		console.log(
			`${season}: Annict ${works.length} works, matched ${records.length}, © applied ${count("applied")}+${count("applied_shared")} shared, held ${count("held_shared") + count("held_ambiguous")}, mismatch ${count("mismatch")}, site ${links.site}, X ${links.x}`,
		);
	}

	const scope = options.seasons.length === 1 ? options.seasons[0] : `${options.seasons[0]}_${options.seasons.at(-1)}`;
	await mkdir(OUTPUT_DIRECTORY, { recursive: true });
	const jsonPath = join(OUTPUT_DIRECTORY, `${scope}.json`);
	await writeFile(jsonPath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
	const tsvPath = join(OUTPUT_DIRECTORY, `${scope}.tsv`);
	const tsv = [
		"result\tanime_id\tmal_id\tseason\ttitle\tannict_copyright\texisting_copyright\tnote",
		...decisions.map((decision) =>
			[
				decision.result,
				decision.anime_id,
				decision.mal_id,
				decision.season ?? "",
				decision.title,
				decision.annict_copyright,
				decision.existing_copyright ?? "",
				decision.note ?? "",
			].join("\t"),
		),
	].join("\n");
	await writeFile(tsvPath, `${tsv}\n`, "utf8");

	const total = (result: CopyrightDecision["result"]) =>
		decisions.filter((decision) => decision.result === result).length;
	console.log(
		`\nDone${options.dryRun ? " (dry run, nothing written)" : ""}. source records: ${savedRecords}, © applied: ${total("applied")}, applied (shared): ${total("applied_shared")}, held (shared): ${total("held_shared")}, held (ambiguous): ${total("held_ambiguous")}, mismatch: ${total("mismatch")}, official site: ${linkTotals.site}, X: ${linkTotals.x}`,
	);
	console.log(`review files: ${jsonPath} / ${tsvPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
