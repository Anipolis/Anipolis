// Annict (api.annict.com) の作品データを Anipolis のカタログ値へ整形する純関数群。
// 取り込みスクリプト scripts/import-annict.ts から使う。

const COPYRIGHT_MARKER_AT_START = /^(©|Ⓒ|\(C\)|（C）)/i;

/**
 * Annict の画像著作権表記を anime.copyright の書式に揃える。
 * Annict は「©」を付けずに保存し表示側で付与するため、先頭に記号が無ければ前置する
 * （途中に別の © を含む「防衛隊第3部隊 ©松本直也／集英社」も先頭に付ける）。
 */
export function normalizeAnnictCopyright(value: string | null | undefined): string | null {
	const trimmed = value?.replace(/\s+/g, " ").trim();
	if (!trimmed) return null;
	return COPYRIGHT_MARKER_AT_START.test(trimmed) ? trimmed : `©${trimmed}`;
}

// 「Ⓒ」は NFKC で英字の「C」になるため、正規化より先に記号を取り除く
const COPYRIGHT_MARKS = /©|Ⓒ|ⓒ|\(c\)|（c）|︎|️/gi;

/**
 * © 表記の比較キー。記号・空白・全半角・スラッシュ表記・定型句の差を無視する。
 * 年だけ違う表記（「©2023 …」と「©2024 …」）は別物として扱う。
 */
export function copyrightComparisonKey(value: string): string {
	return value
		.replace(COPYRIGHT_MARKS, "")
		.normalize("NFKC")
		.replace(COPYRIGHT_MARKS, "")
		.replace(/all\s*rights?\s*reserved\.?/gi, "")
		.replace(/[\s　]+/g, "")
		.replace(/／/g, "/")
		.toLowerCase();
}

/**
 * 実質的に同じ © かを判定する緩い比較キー。copyrightComparisonKey の差に加えて、
 * 年（「©1990 東宝」と「©東宝」）、区切り・括弧などの記号（「・」と「/」）、
 * 会社の接尾語（「DLE Inc.」と「DLE」）、定型句の違いを無視する。
 * 取り込み時の「食い違い」判定と、公式サイトの候補の重複除去に使う。
 */
export function looseCopyrightKey(value: string): string {
	return value
		.replace(COPYRIGHT_MARKS, "")
		.normalize("NFKC")
		.replace(COPYRIGHT_MARKS, "")
		.toLowerCase()
		.replace(/(all|some)\s*rights?\s*reserved\.?/g, "")
		.replace(/株式会社|有限会社|\(株\)|\(有\)/g, "")
		.replace(/(inc|ltd|llc|corp|corporation|co)\.?(?=$|[\s,./・])/g, "")
		.replace(/(19|20)\d{2}/g, "")
		.replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 緩い比較で同じになる候補のうち、年が最も新しい（同年なら長い）表記を選ぶ */
export function pickPreferredCopyright(candidates: readonly string[]): string | undefined {
	const newestYear = (value: string) => Math.max(0, ...[...value.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0])));
	return [...candidates].sort((left, right) => newestYear(right) - newestYear(left) || right.length - left.length)[0];
}

/** 緩い比較で同じ表記をまとめる（各グループは pickPreferredCopyright で代表を選ぶ） */
export function dedupeCopyrightCandidates(candidates: readonly string[]): string[] {
	const groups = new Map<string, string[]>();
	for (const candidate of candidates) {
		const key = looseCopyrightKey(candidate);
		groups.set(key, [...(groups.get(key) ?? []), candidate]);
	}
	return [...groups.values()].map((group) => pickPreferredCopyright(group) as string);
}

export function normalizeAnnictOfficialSiteUrl(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed || !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(trimmed)) return null;
	return trimmed;
}

export function annictTwitterUrl(username: string | null | undefined): string | null {
	const handle = username?.trim().replace(/^@/, "");
	if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
	return `https://x.com/${handle}`;
}
