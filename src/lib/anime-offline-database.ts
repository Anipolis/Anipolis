import type { AnimeResourceLink } from "$lib/types";

export const ANIME_OFFLINE_SOURCE_NAME = "anime-offline-database";
export const ANIME_OFFLINE_REPOSITORY_URL = "https://github.com/manami-project/anime-offline-database";
export const ANIME_OFFLINE_LICENSE_URL = `${ANIME_OFFLINE_REPOSITORY_URL}/blob/master/LICENSE`;
export const ANIME_OFFLINE_ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
export const ANIME_OFFLINE_DBCL_URL = "https://opendatacommons.org/licenses/dbcl/1-0/";
export const ANIPOLIS_TRANSFORMATION_URL =
	"https://github.com/Anipolis/Anipolis/blob/develop/scripts/import-anime-offline-database.ts";

export type AnimeOfflineSeason = "winter" | "spring" | "summer" | "fall";

export type AnimeOfflineEntry = {
	sources: string[];
	title: string;
	type: string;
	episodes: number;
	status: string;
	synonyms?: string[];
	animeSeason: {
		season: string;
		year: number;
	};
	studios: string[];
};

export type AnimeOfflineDataset = {
	license: {
		name: string;
		url: string;
	};
	repository: string;
	lastUpdate: string;
	data: AnimeOfflineEntry[];
};

export function containsJapaneseScript(value: string): boolean {
	return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

export type AnimeOfflineCanonicalRow = {
	mal_id: number;
	title: string;
	title_romaji: string | null;
	episode_count: string | null;
	type: string | null;
	status: "airing" | "finished" | "upcoming";
	season: string;
	studio: string[];
	studio_en: string[];
	resources: AnimeResourceLink[];
};

const MAL_ANIME_PATH = /^\/anime\/(\d+)(?:\/|$)/;

export function getMalIdFromSources(sources: readonly string[]): number | null {
	for (const source of sources) {
		try {
			const url = new URL(source);
			if (url.hostname !== "myanimelist.net" && !url.hostname.endsWith(".myanimelist.net")) continue;

			const match = url.pathname.match(MAL_ANIME_PATH);
			if (!match?.[1]) continue;

			const malId = Number.parseInt(match[1], 10);
			if (Number.isSafeInteger(malId) && malId > 0) return malId;
		} catch {
			// Ignore malformed source URLs from the upstream dataset.
		}
	}

	return null;
}

export function mapAnimeOfflineType(type: string): string | null {
	const types: Record<string, string> = {
		TV: "TV",
		MOVIE: "Movie",
		OVA: "OVA",
		ONA: "ONA",
		SPECIAL: "Special",
	};

	return types[type.toUpperCase()] ?? null;
}

export function mapAnimeOfflineStatus(status: string): "airing" | "finished" | "upcoming" {
	const statuses: Record<string, "airing" | "finished" | "upcoming"> = {
		FINISHED: "finished",
		ONGOING: "airing",
		UPCOMING: "upcoming",
	};

	return statuses[status.toUpperCase()] ?? "upcoming";
}

export function isAnimeOfflineDataset(value: unknown): value is AnimeOfflineDataset {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Partial<AnimeOfflineDataset>;
	return (
		typeof candidate.repository === "string" &&
		typeof candidate.lastUpdate === "string" &&
		typeof candidate.license?.name === "string" &&
		candidate.license.name.toLowerCase().includes("open database license") &&
		Array.isArray(candidate.data)
	);
}

export function isAnimeOfflineSource(resource: AnimeResourceLink): boolean {
	return resource.name.trim().toLowerCase() === ANIME_OFFLINE_SOURCE_NAME;
}

export function findAnimeOfflineSource(resources: readonly AnimeResourceLink[]): AnimeResourceLink | null {
	return resources.find(isAnimeOfflineSource) ?? null;
}

export function mergeAnimeOfflineSource(
	resources: readonly AnimeResourceLink[],
	sourceUrl: string,
): AnimeResourceLink[] {
	return [
		...resources.filter((resource) => !isAnimeOfflineSource(resource)),
		{ name: ANIME_OFFLINE_SOURCE_NAME, url: sourceUrl },
	];
}

export function pinLatestGithubReleaseAssetUrl(datasetUrl: string, latestReleaseUrl: string): string {
	const dataset = new URL(datasetUrl);
	const latestRelease = new URL(latestReleaseUrl);
	const assetMatch = dataset.pathname.match(
		/^(\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/latest\/download\/([^/]+)$/,
	);
	const tagMatch = latestRelease.pathname.match(/^(\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases\/tag\/(.+)$/);

	if (
		dataset.hostname !== "github.com" ||
		latestRelease.hostname !== "github.com" ||
		!assetMatch?.[1] ||
		!assetMatch[2] ||
		!tagMatch?.[1] ||
		!tagMatch[2] ||
		assetMatch[1] !== tagMatch[1]
	) {
		return datasetUrl;
	}

	return `${dataset.origin}${assetMatch[1]}/releases/download/${tagMatch[2]}/${assetMatch[2]}`;
}

function preferSourceString(sourceValue: string | null, existingValue: string | null): string | null {
	return sourceValue?.trim() ? sourceValue : existingValue;
}

export function mergeAnimeOfflineCanonicalRow(
	source: AnimeOfflineCanonicalRow,
	existing:
		| (Omit<AnimeOfflineCanonicalRow, "studio" | "studio_en"> & {
				studio: string[] | null;
				studio_en: string[] | null;
		  })
		| undefined,
): AnimeOfflineCanonicalRow {
	if (!existing) return source;

	const existingStudio = existing.studio ?? [];
	const existingStudioEn = existing.studio_en ?? [];
	const existingTitleIsFallback =
		!containsJapaneseScript(existing.title) &&
		(existing.title_romaji === null || existing.title.trim() === existing.title_romaji.trim());
	const existingStudioIsFallback =
		existingStudio.length === 0 ||
		JSON.stringify(existingStudio.map((name) => name.toLowerCase())) ===
			JSON.stringify(existingStudioEn.map((name) => name.toLowerCase()));

	return {
		...source,
		// The upstream title has no language label. Keep an established Japanese/display title.
		title: existingTitleIsFallback ? source.title : existing.title.trim() || source.title,
		title_romaji: existing.title_romaji ?? source.title_romaji,
		episode_count: preferSourceString(source.episode_count, existing.episode_count),
		type: preferSourceString(source.type, existing.type),
		status: source.status,
		season: source.season,
		// studio is the display/Japanese field; studio_en is the source baseline.
		studio: existingStudioIsFallback ? source.studio : existingStudio,
		studio_en: existingStudioEn.length > 0 ? existingStudioEn : source.studio_en,
		resources: mergeAnimeOfflineSource(existing.resources ?? [], source.resources[0]?.url ?? ""),
	};
}

export function getGithubReleaseVersion(sourceUrl: string): string {
	try {
		const match = new URL(sourceUrl).pathname.match(/\/releases\/download\/([^/]+)\//);
		return match?.[1] ? decodeURIComponent(match[1]) : "custom";
	} catch {
		return "custom";
	}
}
