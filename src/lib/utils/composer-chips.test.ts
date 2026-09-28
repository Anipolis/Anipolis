import { describe, expect, it } from "vitest";
import { animeQuoteChipLabel, chipAnimeTitle, cwChipLabel, normalizeHashtagLabel } from "./composer-chips";

describe("normalizeHashtagLabel", () => {
	it("adds a single leading hash", () => {
		expect(normalizeHashtagLabel("frieren")).toBe("#frieren");
		expect(normalizeHashtagLabel("##frieren ")).toBe("#frieren");
	});

	it("returns an empty string for blank input", () => {
		expect(normalizeHashtagLabel("  ")).toBe("");
		expect(normalizeHashtagLabel("#")).toBe("");
	});
});

describe("animeQuoteChipLabel", () => {
	it("prefers the first usable official hashtag", () => {
		expect(
			animeQuoteChipLabel({ title: "葬送のフリーレン", official_hashtag: ["", "#frieren_anime", "#other"] }),
		).toBe("#frieren_anime");
	});

	it("falls back to the hashtagged title", () => {
		expect(animeQuoteChipLabel({ title: "葬送のフリーレン", official_hashtag: null })).toBe("#葬送のフリーレン");
	});
});

describe("chipAnimeTitle", () => {
	it("uses the Japanese title, then the English title, then a placeholder", () => {
		expect(chipAnimeTitle({ title: "葬送のフリーレン", title_en: "Frieren" })).toBe("葬送のフリーレン");
		expect(chipAnimeTitle({ title: " ", title_en: "Frieren" })).toBe("Frieren");
		expect(chipAnimeTitle({ title: "", title_en: null })).toBe("作品名不明");
	});
});

describe("cwChipLabel", () => {
	it("shows the spoiler role together with the target title", () => {
		expect(cwChipLabel({ title: "葬送のフリーレン" })).toBe("ネタバレ: 葬送のフリーレン");
	});

	it("is distinguishable from the quote chip for the same anime", () => {
		const anime = { title: "葬送のフリーレン", official_hashtag: ["#frieren_anime"] };
		expect(cwChipLabel(anime)).not.toBe(animeQuoteChipLabel(anime));
		expect(cwChipLabel(anime)).toContain("葬送のフリーレン");
	});
});
