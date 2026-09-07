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

/** Build a case-insensitive contains pattern for a user-provided search term. */
export function buildIlikeContainsPattern(value: string): string {
	return `%${escapeIlikePattern(value)}%`;
}
