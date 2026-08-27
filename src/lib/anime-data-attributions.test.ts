import { describe, expect, it } from "vitest";
import type { CatalogSourceRecord } from "./anime-catalog-resolver";
import { buildAnimeDataAttributions } from "./anime-data-attributions";

function source(name: CatalogSourceRecord["source"], sourceUrl: string): CatalogSourceRecord {
	return {
		mal_id: 43760,
		source: name,
		source_url: sourceUrl,
		normalized_data: {},
	};
}

describe("buildAnimeDataAttributions", () => {
	it("publishes only minimal source and license metadata", () => {
		const attributions = buildAnimeDataAttributions([
			source("anime_offline_database", "https://github.com/manami-project/anime-offline-database"),
			source("jikan", "https://api.jikan.moe/v4/anime/43760/full"),
			source("wikidata", "https://www.wikidata.org/wiki/Q113930642"),
			source("syobocal", "https://cal.syoboi.jp/tid/6516"),
			source("manual", "https://admin.example/evidence"),
		]);

		expect(attributions).toEqual([
			{
				anime_mal_id: 43760,
				source: "anime_offline_database",
				label: "anime-offline-database",
				source_url: "https://github.com/manami-project/anime-offline-database",
				license_label: "ODbL 1.0",
				license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
			},
			{
				anime_mal_id: 43760,
				source: "jikan",
				label: "Jikan API（MyAnimeList由来）",
				source_url: "https://api.jikan.moe/v4/anime/43760/full",
				license_label: null,
				license_url: null,
			},
			{
				anime_mal_id: 43760,
				source: "syobocal",
				label: "しょぼいカレンダー",
				source_url: "https://cal.syoboi.jp/tid/6516",
				license_label: null,
				license_url: null,
			},
			{
				anime_mal_id: 43760,
				source: "wikidata",
				label: "Wikidata",
				source_url: "https://www.wikidata.org/wiki/Q113930642",
				license_label: "CC0 1.0",
				license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
			},
		]);
	});

	it("ignores invalid URLs and keeps one attribution per source", () => {
		const otherAnime = { ...source("syobocal", "https://cal.syoboi.jp/tid/3"), mal_id: 43761 };
		const attributions = buildAnimeDataAttributions([
			source("jikan", "not-a-url"),
			source("syobocal", "https://cal.syoboi.jp/tid/1"),
			source("syobocal", "https://cal.syoboi.jp/tid/2"),
			otherAnime,
		]);

		expect(attributions).toHaveLength(2);
		expect(attributions[0]?.source_url).toBe("https://cal.syoboi.jp/tid/2");
		expect(attributions[1]).toMatchObject({ anime_mal_id: 43761, source_url: "https://cal.syoboi.jp/tid/3" });
	});
});
