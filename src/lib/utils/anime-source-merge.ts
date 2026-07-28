import { isAnimeOfflineSource } from "$lib/anime-offline-database";
import type { AnimeResourceLink } from "$lib/types";
import { isMalUrl } from "$lib/utils/url";

export type JikanCanonicalRow = {
	mal_id: number;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	episode_count: string | null;
	type: string | null;
	status: "airing" | "finished" | "upcoming";
	aired_from: string | null;
	aired_to: string | null;
	season: string;
	source: string | null;
	studio: string[];
	studio_en: string[];
	genre: string[];
	genre_en: string[];
	broadcast_day: number | null;
	broadcast_time: string | null;
	official_site_url: string | null;
	official_x_url: string | null;
	resources: AnimeResourceLink[];
	cover_url: string | null;
};

export type ExistingCanonicalRow = Omit<
	JikanCanonicalRow,
	"season" | "studio" | "studio_en" | "genre" | "genre_en" | "resources"
> & {
	season: string | null;
	studio: string[] | null;
	studio_en: string[] | null;
	genre: string[] | null;
	genre_en: string[] | null;
	resources: AnimeResourceLink[] | null;
};

function mergeResourceLinks(existing: AnimeResourceLink[] | null, next: AnimeResourceLink[]) {
	const resources = [
		...(existing ?? []).filter((resource) => resource.name.toLowerCase() !== "mal" && !isMalUrl(resource.url)),
		...next,
	];
	const seen = new Set<string>();
	return resources.filter((resource) => {
		const key = resource.url.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function mergeJikanCanonicalRow(
	jikan: JikanCanonicalRow,
	existing: ExistingCanonicalRow | undefined,
): JikanCanonicalRow {
	if (!existing) return jikan;

	const resources = mergeResourceLinks(existing.resources, jikan.resources);
	const hasAnimeOfflineBaseline = resources.some(isAnimeOfflineSource);
	const existingTitleIsFallback =
		existing.title_romaji === null || existing.title.trim() === existing.title_romaji.trim();
	const existingStudio = existing.studio ?? [];
	const existingStudioEn = existing.studio_en ?? [];
	const existingStudioIsFallback =
		existingStudio.length === 0 ||
		JSON.stringify(existingStudio.map((name) => name.toLowerCase())) ===
			JSON.stringify(existingStudioEn.map((name) => name.toLowerCase()));

	return {
		...jikan,
		title: hasAnimeOfflineBaseline && !existingTitleIsFallback ? existing.title : jikan.title,
		title_en: jikan.title_en ?? existing.title_en,
		title_romaji: hasAnimeOfflineBaseline ? (existing.title_romaji ?? jikan.title_romaji) : jikan.title_romaji,
		episode_count: hasAnimeOfflineBaseline
			? (existing.episode_count ?? jikan.episode_count)
			: (jikan.episode_count ?? existing.episode_count),
		type: hasAnimeOfflineBaseline ? (existing.type ?? jikan.type) : (jikan.type ?? existing.type),
		status: hasAnimeOfflineBaseline ? existing.status : jikan.status,
		aired_from: jikan.aired_from ?? existing.aired_from,
		aired_to: jikan.aired_to ?? existing.aired_to,
		season: hasAnimeOfflineBaseline ? existing.season || jikan.season : jikan.season,
		source: jikan.source ?? existing.source,
		studio: hasAnimeOfflineBaseline && !existingStudioIsFallback ? existingStudio : jikan.studio,
		studio_en:
			hasAnimeOfflineBaseline && existingStudioEn.length > 0 && !existingStudioIsFallback
				? existingStudioEn
				: jikan.studio_en,
		genre: jikan.genre.length > 0 ? jikan.genre : (existing.genre ?? []),
		genre_en: jikan.genre_en.length > 0 ? jikan.genre_en : (existing.genre_en ?? []),
		broadcast_day: jikan.broadcast_day ?? existing.broadcast_day,
		broadcast_time: jikan.broadcast_time ?? existing.broadcast_time,
		official_site_url: jikan.official_site_url ?? existing.official_site_url,
		official_x_url: jikan.official_x_url ?? existing.official_x_url,
		resources,
		cover_url: jikan.cover_url ?? existing.cover_url,
	};
}
