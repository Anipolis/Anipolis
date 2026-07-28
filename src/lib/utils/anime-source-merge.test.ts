import { describe, expect, it } from "vitest";
import { type ExistingCanonicalRow, type JikanCanonicalRow, mergeJikanCanonicalRow } from "./anime-source-merge";

const jikan: JikanCanonicalRow = {
	mal_id: 43760,
	title: "火狩りの王",
	title_en: "The Fire Hunter",
	title_romaji: "Hikari no Ou",
	episode_count: "10",
	type: "TV",
	status: "finished",
	aired_from: "2023-01-14",
	aired_to: "2023-03-18",
	season: "2023-winter",
	source: "小説",
	studio: ["シグナル・エムディ"],
	studio_en: ["Signal.MD"],
	genre: ["ファンタジー"],
	genre_en: ["Fantasy"],
	broadcast_day: 6,
	broadcast_time: "22:30",
	official_site_url: "https://hikarinoou-anime.com/",
	official_x_url: null,
	resources: [{ name: "AniDB", url: "https://anidb.net/anime/16552" }],
	cover_url: null,
};

function offlineExisting(overrides: Partial<ExistingCanonicalRow> = {}): ExistingCanonicalRow {
	return {
		...jikan,
		title: "Hikari no Ou",
		title_en: null,
		title_romaji: null,
		aired_from: null,
		aired_to: null,
		source: null,
		studio: ["signal.md"],
		studio_en: ["signal.md"],
		genre: [],
		genre_en: [],
		broadcast_day: null,
		broadcast_time: null,
		official_site_url: null,
		resources: [{ name: "anime-offline-database", url: "https://example.com/2026-27.json" }],
		...overrides,
	};
}

describe("mergeJikanCanonicalRow", () => {
	it("uses Jikan for fields that the ODbL baseline cannot identify semantically", () => {
		expect(mergeJikanCanonicalRow(jikan, offlineExisting())).toMatchObject({
			title: "火狩りの王",
			title_en: "The Fire Hunter",
			title_romaji: "Hikari no Ou",
			episode_count: "10",
			studio: ["シグナル・エムディ"],
			studio_en: ["Signal.MD"],
			genre: ["ファンタジー"],
			aired_from: "2023-01-14",
		});
	});

	it("keeps an established Japanese display title and the ODbL attribution", () => {
		const merged = mergeJikanCanonicalRow(
			jikan,
			offlineExisting({ title: "既存の手動タイトル", title_romaji: "Existing Romaji" }),
		);

		expect(merged.title).toBe("既存の手動タイトル");
		expect(merged.title_romaji).toBe("Existing Romaji");
		expect(merged.resources.some((resource) => resource.name === "anime-offline-database")).toBe(true);
		expect(merged.resources.some((resource) => resource.name === "AniDB")).toBe(true);
	});
});
