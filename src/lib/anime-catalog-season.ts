export const ANIME_CATALOG_SEASON_SOURCES = ["anime_offline_database", "jikan"] as const;

export type AnimeCatalogSeasonSource = (typeof ANIME_CATALOG_SEASON_SOURCES)[number];

export function collectAnimeCatalogSeasonMalIds(
	rows: readonly { mal_id: number; source: AnimeCatalogSeasonSource }[],
): number[] {
	return [...new Set(rows.map((row) => row.mal_id))].sort((left, right) => left - right);
}
