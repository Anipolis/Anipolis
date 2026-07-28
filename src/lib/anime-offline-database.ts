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
