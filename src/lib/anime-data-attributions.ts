import type { CatalogSourceRecord } from "./anime-catalog-resolver";
import type { AnimeDataAttribution, AnimeDataAttributionSource } from "./types";

type AttributionDefinition = Omit<AnimeDataAttribution, "anime_mal_id" | "source_url">;

const ATTRIBUTION_DEFINITIONS: Record<AnimeDataAttributionSource, AttributionDefinition> = {
	anime_offline_database: {
		source: "anime_offline_database",
		label: "anime-offline-database",
		license_label: "ODbL 1.0",
		license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
	},
	jikan: {
		source: "jikan",
		label: "Jikan API（MyAnimeList由来）",
		license_label: null,
		license_url: null,
	},
	mal: {
		source: "mal",
		label: "MyAnimeList",
		license_label: null,
		license_url: null,
	},
	wikidata: {
		source: "wikidata",
		label: "Wikidata",
		license_label: "CC0 1.0",
		license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
	},
	syobocal: {
		source: "syobocal",
		label: "しょぼいカレンダー",
		license_label: null,
		license_url: null,
	},
};

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export function buildAnimeDataAttributions(sourceRecords: readonly CatalogSourceRecord[]): AnimeDataAttribution[] {
	const byAnimeAndSource = new Map<string, AnimeDataAttribution>();
	for (const record of sourceRecords) {
		if (record.source === "manual" || !isHttpUrl(record.source_url)) continue;
		const definition = ATTRIBUTION_DEFINITIONS[record.source];
		byAnimeAndSource.set(`${record.mal_id}:${record.source}`, {
			anime_mal_id: record.mal_id,
			...definition,
			source_url: record.source_url,
		});
	}
	return [...byAnimeAndSource.values()].sort(
		(left, right) => left.anime_mal_id - right.anime_mal_id || left.source.localeCompare(right.source),
	);
}
