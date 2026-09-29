/**
 * Escape a user-provided value for use inside a PostgreSQL ILIKE pattern.
 *
 * The backslash is escaped first so that the escapes added for `%` and `_`
 * remain literal. PostgREST filter syntax escaping is a separate concern and
 * is handled by `quoteOrFilterValue` when a pattern is embedded in `.or()`.
 */
export function escapeIlikePattern(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * アカウント検索の入力を正規化する。"@name" や "＠name" のように @ 付きで打っても
 * username で検索できるよう先頭の @ を外し、前後の空白を落とす。
 * "@" だけなら空文字（検索しない）。
 */
export function normalizeAccountQuery(raw: string | null | undefined): string {
	return (raw ?? "")
		.trim()
		.replace(/^[@＠]+/, "")
		.trim();
}

/** ユーザー検索 API が受け付ける検索語の最大長（LIKE の全件走査に近いクエリを避ける） */
export const MAX_ACCOUNT_QUERY_LENGTH = 50;

/** Build a case-insensitive contains pattern for a user-provided search term. */
export function buildIlikeContainsPattern(value: string): string {
	return `%${escapeIlikePattern(value)}%`;
}
