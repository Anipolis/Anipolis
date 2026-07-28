import { describe, expect, it } from "vitest";
import { collectAnimeCatalogSeasonMalIds } from "./anime-catalog-season";

describe("collectAnimeCatalogSeasonMalIds", () => {
	it("keeps Jikan-only anime in the season catalog", () => {
		expect(
			collectAnimeCatalogSeasonMalIds([
				{ mal_id: 100, source: "anime_offline_database" },
				{ mal_id: 200, source: "jikan" },
			]),
		).toEqual([100, 200]);
	});

	it("deduplicates anime found in both ODbL and Jikan", () => {
		expect(
			collectAnimeCatalogSeasonMalIds([
				{ mal_id: 200, source: "jikan" },
				{ mal_id: 100, source: "anime_offline_database" },
				{ mal_id: 200, source: "anime_offline_database" },
			]),
		).toEqual([100, 200]);
	});
});
