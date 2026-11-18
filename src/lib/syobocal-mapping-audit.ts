/**
 * しょぼいカレンダーの対応（anime ↔ TID）の点検（#593）。
 *
 * 分割2クールの第2クールで、しょぼいが別の TID を新しく作ることがある。対応が1クール目の TID のままだと、
 * 再放送の枠しか入らず、本放送の枠と話数ルームが作られない。誰かが「ルームが出ない」と気づくまで分からないので、
 * 日次の同期のあとに機械的に洗い出す。あわせて、話数が空の放送中作品（#597）も手入力の候補として出す。
 */

export type AuditAnime = {
	id: number;
	mal_id: number | null;
	title: string;
	type: string | null;
	aired_from: string | null;
	episode_total: number | null;
	room_type: string | null;
};

export type AuditSessionCounts = { first: number; rerun: number };

export type MappingIssueKind = "rerun_only" | "no_sessions" | "missing_episode_total";

export type MappingIssue = {
	kind: MappingIssueKind;
	animeId: number;
	malId: number | null;
	title: string;
	/** 対応づけている TID（無ければ空） */
	tids: number[];
	sessions: AuditSessionCounts;
};

export const MAPPING_ISSUE_LABELS: Record<MappingIssueKind, string> = {
	rerun_only: "本放送の枠が無く、再放送の枠だけ（新しい TID の可能性）",
	no_sessions: "TID はあるのに、放送開始後も枠が無い",
	missing_episode_total: "話数が空（手入力の候補）",
};

/** 放送が始まってから、枠が入るまでに待つ日数。始まった直後の取り込み待ちを誤検知しないため */
export const NO_SESSIONS_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromDate: string, today: string): number {
	return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${fromDate.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/**
 * 今期の作品ごとに、対応と放送枠の数から怪しいものを返す。
 * 対象は話数ルームを持つ TV 作品（作品ルームだけの作品・映画などは対象外）で、放送が始まっているもの
 */
export function findMappingIssues(input: {
	anime: readonly AuditAnime[];
	tidsByMalId: ReadonlyMap<number, number[]>;
	sessionsByAnimeId: ReadonlyMap<number, AuditSessionCounts>;
	/** JST の今日（YYYY-MM-DD） */
	today: string;
}): MappingIssue[] {
	const issues: MappingIssue[] = [];
	for (const anime of input.anime) {
		if (anime.type !== "TV" || anime.room_type === "global") continue;
		if (!anime.aired_from || daysBetween(anime.aired_from, input.today) < 0) continue;
		const tids = anime.mal_id != null ? (input.tidsByMalId.get(anime.mal_id) ?? []) : [];
		const sessions = input.sessionsByAnimeId.get(anime.id) ?? { first: 0, rerun: 0 };
		const base = { animeId: anime.id, malId: anime.mal_id, title: anime.title, tids, sessions };
		if (tids.length > 0) {
			if (sessions.first === 0 && sessions.rerun > 0) issues.push({ kind: "rerun_only", ...base });
			else if (
				sessions.first === 0 &&
				sessions.rerun === 0 &&
				daysBetween(anime.aired_from, input.today) >= NO_SESSIONS_GRACE_DAYS
			) {
				issues.push({ kind: "no_sessions", ...base });
			}
		}
		if (anime.episode_total == null && (sessions.first > 0 || tids.length > 0)) {
			issues.push({ kind: "missing_episode_total", ...base });
		}
	}
	return issues;
}

/** 前回までに知らせた分と比べるための鍵 */
export function mappingIssueKey(issue: Pick<MappingIssue, "kind" | "animeId">): string {
	return `${issue.kind}:${issue.animeId}`;
}

/**
 * TitleSearch の題名検索に使う語。「第2クール」「第2期」「2nd Season」などの続編の印と、
 * 記号の後ろ（サブタイトル）を落として、1クール目と2クール目で共通する頭の部分にする
 */
export function titleSearchBase(title: string): string {
	const stripped = title
		.replace(
			/[\s　]*(第\s*[0-9０-９一二三四五六七八九十]+\s*(クール|期|シーズン|部|章)|[0-9]+(st|nd|rd|th)\s*season|season\s*[0-9]+|2クール目?|後半|分割).*$/iu,
			"",
		)
		.split(/[\s　]*[〜~:：\-－―『「(（]/u)[0]
		?.trim();
	return stripped && stripped.length >= 2 ? stripped : title.trim();
}

export type TitleSearchHit = { tid: number; title: string; firstYear: number | null; firstMonth: number | null };

/** json.php?Req=TitleSearch の結果を読む。形が違えば空 */
export function parseTitleSearch(json: unknown): TitleSearchHit[] {
	const titles = (json as { Titles?: unknown } | null)?.Titles;
	if (!titles || typeof titles !== "object") return [];
	const hits: TitleSearchHit[] = [];
	for (const value of Object.values(titles as Record<string, unknown>)) {
		const row = value as Record<string, unknown>;
		const tid = Number.parseInt(String(row["TID"] ?? ""), 10);
		const title = typeof row["Title"] === "string" ? row["Title"] : "";
		if (!Number.isSafeInteger(tid) || tid <= 0 || !title) continue;
		const year = Number.parseInt(String(row["FirstYear"] ?? ""), 10);
		const month = Number.parseInt(String(row["FirstMonth"] ?? ""), 10);
		hits.push({
			tid,
			title,
			firstYear: Number.isSafeInteger(year) ? year : null,
			firstMonth: Number.isSafeInteger(month) ? month : null,
		});
	}
	return hits;
}

/**
 * 対応づけている TID より新しく、題名に検索語を含むものを、新しい順に返す。
 * しょぼい側の題名は頭に語が付くことがある（「ルルットリリィ」→「魔法の姉妹ルルットリリィ(第2クール)」）ので、前方一致にはしない
 */
export function newerTidCandidates(
	hits: readonly TitleSearchHit[],
	base: string,
	currentTids: readonly number[],
): TitleSearchHit[] {
	const newestCurrent = currentTids.length > 0 ? Math.max(...currentTids) : 0;
	const normalizedBase = base.normalize("NFKC").toLowerCase();
	return hits
		.filter((hit) => hit.tid > newestCurrent && hit.title.normalize("NFKC").toLowerCase().includes(normalizedBase))
		.sort((a, b) => b.tid - a.tid);
}

/**
 * 点検の状態ファイル。notified は Discord への送信に成功した問題の鍵だけを持つ。
 * 送信の前に知らせ済みにすると、送信に失敗した問題が二度と知らされなくなるため（Codex レビュー）
 */
export type MappingAuditState = { season: string; checkedAt: string; keys: string[]; notified: string[] };

export function readMappingAuditState(json: unknown): { notified: Set<string> } {
	const notified = (json as { notified?: unknown } | null)?.notified;
	return { notified: new Set(Array.isArray(notified) ? notified.filter((key) => typeof key === "string") : []) };
}

/** 知らせる問題（本放送が入らない2種類で、まだ送れていないもの） */
export function issuesToNotify(issues: readonly MappingIssue[], notified: ReadonlySet<string>): MappingIssue[] {
	return issues.filter((issue) => issue.kind !== "missing_episode_total" && !notified.has(mappingIssueKey(issue)));
}

/**
 * 今回の点検の結果で状態を作り直す。知らせ済みは、今も続いている問題の分だけ残す
 * （直ったあとにまた同じ問題が起きたら、もう一度知らせる）。新しく知らせる分はここでは足さない
 */
export function nextMappingAuditState(
	issues: readonly MappingIssue[],
	notified: ReadonlySet<string>,
	season: string,
	checkedAt: string,
): MappingAuditState {
	const keys = issues.map(mappingIssueKey);
	return { season, checkedAt, keys, notified: keys.filter((key) => notified.has(key)) };
}

/** 送信に成功した鍵を、知らせ済みに足す */
export function markNotified(state: unknown, sentKeys: readonly string[]): MappingAuditState {
	const base = (state ?? {}) as Partial<MappingAuditState>;
	const { notified } = readMappingAuditState(state);
	for (const key of sentKeys) notified.add(key);
	return {
		season: typeof base.season === "string" ? base.season : "",
		checkedAt: typeof base.checkedAt === "string" ? base.checkedAt : "",
		keys: Array.isArray(base.keys) ? base.keys : [],
		notified: [...notified],
	};
}
