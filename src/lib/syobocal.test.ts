import { describe, expect, it } from "vitest";
import {
	findSyobocalOfficialSiteUrl,
	findSyobocalOfficialXUrl,
	matchSyobocalTitlesExactly,
	normalizeSyobocalTitle,
	parseSyobocalLinks,
} from "./syobocal";

describe("Syoboi Calendar title helpers", () => {
	it("normalizes width and whitespace without fuzzy matching", () => {
		expect(normalizeSyobocalTitle(" 葬送のフリーレン（第２期） ")).toBe("葬送のフリーレン");
		expect(normalizeSyobocalTitle("火狩りの王 第1期")).toBe("火狩りの王");
		expect(normalizeSyobocalTitle("ヴィンランド・サガ SEASON 2")).toBe("ヴィンランド・サガ");
		expect(normalizeSyobocalTitle("英雄王 〜そして〜")).toBe("英雄王~そして~");
	});

	it("extracts labeled links and selects official destinations", () => {
		const links = parseSyobocalLinks(`*リンク
-[[公式 https://example.com/anime]]
-[[X https://x.com/example]]
-[[配信 https://example.net/watch]]`);
		expect(links).toHaveLength(3);
		expect(findSyobocalOfficialSiteUrl(links)).toBe("https://example.com/anime");
		expect(findSyobocalOfficialXUrl(links)).toBe("https://x.com/example");
	});

	it("matches only bidirectionally unique titles within one month", () => {
		const matches = matchSyobocalTitlesExactly(
			[
				{ malId: 1, title: "作品A", firstYear: 2026, firstMonth: 1 },
				{ malId: 2, title: "作品B", firstYear: 2026, firstMonth: 1 },
				{ malId: 3, title: "作品B", firstYear: 2026, firstMonth: 1 },
				{ malId: 4, title: "作品C", firstYear: 2025, firstMonth: 1 },
			],
			[
				{ tid: 10, title: "作品Ａ", firstYear: 2026, firstMonth: 2 },
				{ tid: 20, title: "作品B", firstYear: 2026, firstMonth: 1 },
				{ tid: 30, title: "作品C", firstYear: 2026, firstMonth: 1 },
			],
		);
		expect(matches).toEqual([{ malId: 1, tid: 10, normalizedTitle: "作品A" }]);
	});

	it("can disambiguate identical titles by their first broadcast month", () => {
		const matches = matchSyobocalTitlesExactly(
			[
				{ malId: 1, title: "同名作品", firstYear: 2020, firstMonth: 1 },
				{ malId: 2, title: "同名作品", firstYear: 2026, firstMonth: 1 },
			],
			[
				{ tid: 10, title: "同名作品", firstYear: 2020, firstMonth: 1 },
				{ tid: 20, title: "同名作品", firstYear: 2026, firstMonth: 1 },
			],
		);
		expect(matches).toEqual([
			{ malId: 1, tid: 10, normalizedTitle: "同名作品" },
			{ malId: 2, tid: 20, normalizedTitle: "同名作品" },
		]);
	});

	it("uses a season year even when an exact broadcast month is unavailable", () => {
		expect(
			matchSyobocalTitlesExactly(
				[{ malId: 1, title: "同名作品", firstYear: 2026, firstMonth: null }],
				[
					{ tid: 10, title: "同名作品", firstYear: 2025, firstMonth: 1 },
					{ tid: 20, title: "同名作品", firstYear: 2026, firstMonth: 3 },
				],
			),
		).toEqual([{ malId: 1, tid: 20, normalizedTitle: "同名作品" }]);
	});
});
