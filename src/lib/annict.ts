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

/**
 * © 表記の比較キー。記号・空白・全半角・スラッシュ表記・定型句の差を無視する。
 * 年だけ違う表記（「©2023 …」と「©2024 …」）は別物として扱う。
 */
export function copyrightComparisonKey(value: string): string {
	return value
		.normalize("NFKC")
		.replace(/©|Ⓒ|︎|️|\(c\)/gi, "")
		.replace(/all\s*rights?\s*reserved\.?/gi, "")
		.replace(/[\s　]+/g, "")
		.replace(/／/g, "/")
		.toLowerCase();
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
