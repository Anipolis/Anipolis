import { describe, expect, it } from "vitest";
import { animeCardMeta, animeSeasonLabel, animeTypeLabel } from "./anime-labels";

describe("animeTypeLabel", () => {
	it.each([
		["TV", "TV"],
		["Movie", "映画"],
		["OVA", "OVA"],
		["ONA", "Web"],
		["Special", "特別"],
		[null, null],
	])("%s → %s", (type, expected) => {
		expect(animeTypeLabel(type)).toBe(expected);
	});
});

describe("animeSeasonLabel", () => {
	it.each([
		["2026-spring", "2026年春"],
		["1988-winter", "1988年冬"],
		["2025-fall", "2025年秋"],
		["2024-summer", "2024年夏"],
		["2024", "2024"],
		[null, null],
	])("%s → %s", (season, expected) => {
		expect(animeSeasonLabel(season)).toBe(expected);
	});
});

describe("animeCardMeta", () => {
	it.each([
		[{ type: "TV", season: "2026-spring" }, "TV・2026年春"],
		[{ type: "Movie", season: "2024-summer" }, "映画・2024年"],
		[{ type: "OVA", season: "1988-winter" }, "OVA・1988年冬"],
		[{ type: "ONA", season: "2025-fall" }, "Web・2025年秋"],
		[{ type: null, season: "2025-fall" }, "2025年秋"],
		[{ type: "Movie", season: null }, "映画"],
		[{}, ""],
	])("%o → %s", (anime, expected) => {
		expect(animeCardMeta(anime)).toBe(expected);
	});
});
