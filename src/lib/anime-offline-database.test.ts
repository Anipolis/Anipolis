import { describe, expect, it } from "vitest";
import {
	findAnimeOfflineSource,
	getGithubReleaseVersion,
	getMalIdFromSources,
	mapAnimeOfflineStatus,
	mapAnimeOfflineType,
	mergeAnimeOfflineCanonicalRow,
	mergeAnimeOfflineSource,
	pinLatestGithubReleaseAssetUrl,
} from "./anime-offline-database";

describe("anime-offline-database helpers", () => {
	it("extracts only a valid MyAnimeList anime ID", () => {
		expect(
			getMalIdFromSources([
				"https://anidb.net/anime/123",
				"https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood",
			]),
		).toBe(5114);
		expect(getMalIdFromSources(["https://example.com/anime/5114"])).toBeNull();
		expect(getMalIdFromSources(["not a URL"])).toBeNull();
	});

	it("maps supported types and statuses to Anipolis values", () => {
		expect(mapAnimeOfflineType("TV")).toBe("TV");
		expect(mapAnimeOfflineType("MOVIE")).toBe("Movie");
		expect(mapAnimeOfflineType("UNKNOWN")).toBeNull();
		expect(mapAnimeOfflineStatus("FINISHED")).toBe("finished");
		expect(mapAnimeOfflineStatus("ONGOING")).toBe("airing");
		expect(mapAnimeOfflineStatus("UPCOMING")).toBe("upcoming");
	});

	it("keeps one replaceable attribution resource", () => {
		const resources = mergeAnimeOfflineSource(
			[
				{ name: "Official", url: "https://example.com" },
				{ name: "anime-offline-database", url: "https://example.com/old" },
			],
			"https://example.com/release/2026-27/data.json",
		);

		expect(resources).toHaveLength(2);
		expect(findAnimeOfflineSource(resources)?.url).toContain("2026-27");
	});

	it("pins a GitHub latest release asset to the resolved tag", () => {
		expect(
			pinLatestGithubReleaseAssetUrl(
				"https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json",
				"https://github.com/manami-project/anime-offline-database/releases/tag/2026-27",
			),
		).toBe(
			"https://github.com/manami-project/anime-offline-database/releases/download/2026-27/anime-offline-database-minified.json",
		);
		expect(
			getGithubReleaseVersion(
				"https://github.com/manami-project/anime-offline-database/releases/download/2026-27/data.json",
			),
		).toBe("2026-27");
	});

	it("uses ODbL core fields without replacing an established Japanese display title", () => {
		const source = {
			mal_id: 43760,
			title: "Hikari no Ou",
			title_romaji: null,
			episode_count: "10",
			type: "TV",
			status: "finished" as const,
			season: "2023-winter",
			studio: ["signal.md"],
			studio_en: ["signal.md"],
			resources: [{ name: "anime-offline-database", url: "https://example.com/2026-27.json" }],
		};
		const existing = {
			...source,
			title: "火狩りの王",
			title_romaji: "The Fire Hunter",
			episode_count: "9",
			status: "airing" as const,
			studio: ["シグナル・エムディ"],
			studio_en: ["Signal.MD"],
		};

		expect(mergeAnimeOfflineCanonicalRow(source, existing)).toMatchObject({
			title: "火狩りの王",
			title_romaji: "The Fire Hunter",
			episode_count: "10",
			status: "finished",
			studio: ["シグナル・エムディ"],
			studio_en: ["Signal.MD"],
		});
	});

	it("keeps a Wikidata Japanese title when the romaji title is not populated", () => {
		const source = {
			mal_id: 43760,
			title: "Hikari no Ou",
			title_romaji: null,
			episode_count: "10",
			type: "TV",
			status: "finished" as const,
			season: "2023-winter",
			studio: ["signal.md"],
			studio_en: ["signal.md"],
			resources: [{ name: "anime-offline-database", url: "https://example.com/2026-27.json" }],
		};

		expect(mergeAnimeOfflineCanonicalRow(source, { ...source, title: "火狩りの王" }).title).toBe("火狩りの王");
	});
});
