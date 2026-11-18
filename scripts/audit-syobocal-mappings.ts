/**
 * しょぼいカレンダーの対応（anime ↔ TID）を点検する（#593）。今期の放送中の TV 作品について、
 *   - 本放送の枠が無く、再放送の枠だけ（分割2クールで新しい TID ができた可能性）
 *   - TID はあるのに、放送開始後も枠が無い
 *   - 話数が空（#597。作品ページの話数一覧が第1話から並ぶので、手入力の候補）
 * を一覧にする。前の2つは、しょぼいの TitleSearch で題名を含む新しい TID を候補として出す。
 * DB は書き換えない（対応表 scripts/data/syobocal-manual-mappings.json は人が直す）。
 *
 *   pnpm audit:syobocal-mappings                         # 今期を点検して一覧を出す
 *   pnpm audit:syobocal-mappings -- --year 2026 --season fall
 *   pnpm audit:syobocal-mappings -- --no-title-search    # しょぼいへの問い合わせをしない
 *   pnpm audit:syobocal-mappings -- --state .sync-logs/state-syobocal-audit.json --alert-out .sync-logs/syobocal-audit-alert.txt
 *     # 前回の結果と比べ、新しく見つかったものがあるときだけ知らせの本文を書く（日次の同期が Discord へ送る）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
	type AuditAnime,
	type AuditSessionCounts,
	findMappingIssues,
	MAPPING_ISSUE_LABELS,
	type MappingIssue,
	mappingIssueKey,
	newerTidCandidates,
	parseTitleSearch,
	type TitleSearchHit,
	titleSearchBase,
} from "../src/lib/syobocal-mapping-audit.ts";

type SeasonName = "winter" | "spring" | "summer" | "fall";
const SEASON_START_MONTH: Record<SeasonName, number> = { winter: 1, spring: 4, summer: 7, fall: 10 };
const PAGE_SIZE = 1000;
const ID_CHUNK = 100;
const TITLE_SEARCH_ENDPOINT = "https://cal.syoboi.jp/json.php";
const USER_AGENT = "Anipolis/1.0 (https://github.com/Anipolis/Anipolis)";
const TITLE_SEARCH_INTERVAL_MS = 1100;

function jstToday(): string {
	return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function currentSeason(today: string): { year: number; season: SeasonName } {
	const [year, month] = today.split("-").map(Number) as [number, number];
	const season: SeasonName = month <= 3 ? "winter" : month <= 6 ? "spring" : month <= 9 ? "summer" : "fall";
	return { year, season };
}

function parseArgs(argv: string[]) {
	const options = {
		year: null as number | null,
		season: null as SeasonName | null,
		titleSearch: true,
		state: null as string | null,
		alertOut: null as string | null,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--" || arg === undefined) continue;
		if (arg === "--no-title-search") options.titleSearch = false;
		else if (arg === "--year" && next) {
			options.year = Number.parseInt(next, 10);
			index += 1;
		} else if (arg === "--season" && next && next in SEASON_START_MONTH) {
			options.season = next as SeasonName;
			index += 1;
		} else if (arg === "--state" && next) {
			options.state = next;
			index += 1;
		} else if (arg === "--alert-out" && next) {
			options.alertOut = next;
			index += 1;
		} else throw new Error(`Unknown argument: ${arg}`);
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

type Client = ReturnType<typeof getSupabaseClient>;

async function fetchSeasonAnime(supabase: Client, seasonTag: string): Promise<AuditAnime[]> {
	const rows: AuditAnime[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("anime")
			.select("id,mal_id,title,type,aired_from,episode_total,room_type")
			.eq("season", seasonTag)
			.eq("hidden_by_admin", false)
			.order("id")
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`Could not read anime: ${error.message}`);
		rows.push(...((data ?? []) as AuditAnime[]));
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

/** 今日の時点で有効な、しょぼいの確定した対応（mal_id → TID） */
async function fetchTidsByMalId(supabase: Client, malIds: number[], today: string): Promise<Map<number, number[]>> {
	const byMal = new Map<number, number[]>();
	for (let start = 0; start < malIds.length; start += ID_CHUNK) {
		const { data, error } = await supabase
			.from("anime_external_mappings")
			.select("mal_id,external_key,valid_from,valid_to")
			.eq("external_source", "syobocal")
			.eq("match_status", "confirmed")
			.in("mal_id", malIds.slice(start, start + ID_CHUNK));
		if (error) throw new Error(`Could not read anime_external_mappings: ${error.message}`);
		for (const row of data ?? []) {
			const validFrom = (row.valid_from as string | null) ?? null;
			const validTo = (row.valid_to as string | null) ?? null;
			if ((validFrom && validFrom > today) || (validTo && validTo < today)) continue;
			const tid = Number.parseInt(String(row.external_key ?? ""), 10);
			if (!Number.isSafeInteger(tid) || tid <= 0) continue;
			const malId = Number(row.mal_id);
			byMal.set(malId, [...new Set([...(byMal.get(malId) ?? []), tid])]);
		}
	}
	return byMal;
}

/** 今期の始まりから今日までの、作品ごとの本放送・再放送の枠の数（休止も数えない区別はしない） */
async function fetchSessionCounts(
	supabase: Client,
	animeIds: number[],
	seasonStart: string,
	today: string,
): Promise<Map<number, AuditSessionCounts>> {
	const counts = new Map<number, AuditSessionCounts>();
	for (let start = 0; start < animeIds.length; start += ID_CHUNK) {
		for (let from = 0; ; from += PAGE_SIZE) {
			const { data, error } = await supabase
				.from("broadcast_room_sessions")
				.select("id,anime_id,airing_kind")
				.in("anime_id", animeIds.slice(start, start + ID_CHUNK))
				.gte("room_date", seasonStart)
				.lte("room_date", today)
				.order("id")
				.range(from, from + PAGE_SIZE - 1);
			if (error) throw new Error(`Could not read broadcast_room_sessions: ${error.message}`);
			for (const row of data ?? []) {
				const entry = counts.get(row.anime_id) ?? { first: 0, rerun: 0 };
				if (row.airing_kind === "rerun") entry.rerun += 1;
				else if (row.airing_kind === "first") entry.first += 1;
				counts.set(row.anime_id, entry);
			}
			if (!data || data.length < PAGE_SIZE) break;
		}
	}
	return counts;
}

async function searchTitles(base: string): Promise<TitleSearchHit[]> {
	const url = `${TITLE_SEARCH_ENDPOINT}?Req=TitleSearch&Search=${encodeURIComponent(base)}&Limit=20`;
	try {
		const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
		if (!response.ok) return [];
		return parseTitleSearch(await response.json());
	} catch {
		return [];
	}
}

function formatIssue(issue: MappingIssue, candidates: TitleSearchHit[] | undefined): string {
	const tids = issue.tids.length > 0 ? `TID ${issue.tids.join(",")}` : "TID なし";
	const sessions = `本放送 ${issue.sessions.first}・再放送 ${issue.sessions.rerun}`;
	const lines = [
		`- ${issue.title}（anime ${issue.animeId}${issue.malId ? `・MAL ${issue.malId}` : ""}、${tids}、${sessions}）`,
	];
	if (candidates && candidates.length > 0) {
		lines.push(
			`  新しい TID の候補: ${candidates
				.slice(0, 3)
				.map(
					(hit) =>
						`${hit.tid}「${hit.title}」${hit.firstYear ? `${hit.firstYear}/${hit.firstMonth ?? "?"}〜` : ""}`,
				)
				.join("、")}`,
		);
	}
	return lines.join("\n");
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const today = jstToday();
	const { year, season } =
		options.year && options.season ? { year: options.year, season: options.season } : currentSeason(today);
	const seasonTag = `${year}-${season}`;
	const seasonStart = `${year}-${String(SEASON_START_MONTH[season]).padStart(2, "0")}-01`;
	const supabase = getSupabaseClient();

	const anime = await fetchSeasonAnime(supabase, seasonTag);
	const malIds = anime.flatMap((row) => (row.mal_id != null ? [row.mal_id] : []));
	const [tidsByMalId, sessionsByAnimeId] = await Promise.all([
		fetchTidsByMalId(supabase, malIds, today),
		fetchSessionCounts(
			supabase,
			anime.map((row) => row.id),
			seasonStart,
			today,
		),
	]);
	const issues = findMappingIssues({ anime, tidsByMalId, sessionsByAnimeId, today });

	// 本放送が入っていない作品だけ、しょぼいに題名で問い合わせて新しい TID を探す（1秒あけて順に）
	const candidatesByAnime = new Map<number, TitleSearchHit[]>();
	if (options.titleSearch) {
		for (const issue of issues.filter((item) => item.kind !== "missing_episode_total")) {
			const base = titleSearchBase(issue.title);
			candidatesByAnime.set(issue.animeId, newerTidCandidates(await searchTitles(base), base, issue.tids));
			await new Promise((resolve) => setTimeout(resolve, TITLE_SEARCH_INTERVAL_MS));
		}
	}

	console.log(`Syobocal mapping audit for ${seasonTag} (${today}): ${anime.length} anime, ${issues.length} issues.`);
	const sections: string[] = [];
	for (const kind of ["rerun_only", "no_sessions", "missing_episode_total"] as const) {
		const ofKind = issues.filter((issue) => issue.kind === kind);
		if (ofKind.length === 0) continue;
		sections.push(
			[
				`■ ${MAPPING_ISSUE_LABELS[kind]}: ${ofKind.length}件`,
				...ofKind.map((issue) => formatIssue(issue, candidatesByAnime.get(issue.animeId))),
			].join("\n"),
		);
	}
	console.log(sections.length > 0 ? sections.join("\n\n") : "No issues found.");

	// 前回と比べて新しく見つかったものだけを知らせる（毎日同じ知らせを送らない）
	if (options.state) {
		const previous = new Set<string>(
			existsSync(options.state)
				? ((JSON.parse(readFileSync(options.state, "utf8")) as { keys?: string[] }).keys ?? [])
				: [],
		);
		// 知らせるのは本放送が入らない2種類だけ。話数が空のものは一覧（ログ）にだけ出す
		// （#597 の修正で、放送開始の週の話数から範囲を出せるようになったため、急ぎではない）
		const fresh = issues.filter(
			(issue) => issue.kind !== "missing_episode_total" && !previous.has(mappingIssueKey(issue)),
		);
		mkdirSync(dirname(options.state), { recursive: true });
		writeFileSync(
			options.state,
			JSON.stringify({ season: seasonTag, checkedAt: today, keys: issues.map(mappingIssueKey) }, null, 2),
		);
		if (options.alertOut) {
			if (fresh.length > 0) {
				const message = [
					`[Anipolis] しょぼいカレンダーの対応の点検（${seasonTag}）で、新しく ${fresh.length} 件見つかりました`,
					...fresh.map(
						(issue) =>
							`${MAPPING_ISSUE_LABELS[issue.kind]}\n${formatIssue(issue, candidatesByAnime.get(issue.animeId))}`,
					),
					"対応表: scripts/data/syobocal-manual-mappings.json（#593）",
				].join("\n");
				mkdirSync(dirname(options.alertOut), { recursive: true });
				writeFileSync(options.alertOut, message);
				console.log(`Alert written: ${fresh.length} new issues.`);
			} else if (existsSync(options.alertOut)) {
				rmSync(options.alertOut);
			}
		}
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
