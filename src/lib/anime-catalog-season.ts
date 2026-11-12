// シーズンの作品一覧（どの作品をそのシーズンのカタログに含めるか）を決めるソース。
// MAL 公式 API の記録も含める。公開 Jikan が長く止まると（2026-10〜、#595）
// Jikan の記録が増えず、新しいシーズンの作品がカタログに入らなくなるため。
// MAL の記録は import:mal が AniList のシーズン一覧と既存記録から対象を決めて作る。
export const ANIME_CATALOG_SEASON_SOURCES = ["anime_offline_database", "jikan", "mal"] as const;

export type AnimeCatalogSeasonSource = (typeof ANIME_CATALOG_SEASON_SOURCES)[number];

export function collectAnimeCatalogSeasonMalIds(
	rows: readonly { mal_id: number; source: AnimeCatalogSeasonSource }[],
): number[] {
	return [...new Set(rows.map((row) => row.mal_id))].sort((left, right) => left - right);
}
