import { describe, expect, it } from "vitest";
import {
	findSyobocalOfficialSiteUrl,
	findSyobocalOfficialXUrl,
	findSyobocalWikipediaArticleLinks,
	findSyobocalWikipediaKeywordLinks,
	japaneseWikipediaArticleTitle,
	kanaFoldTitle,
	latinFoldTitle,
	matchSyobocalTitlesByReading,
	matchSyobocalTitlesExactly,
	normalizeSyobocalTitle,
	parseSyobocalLinks,
	syobocalTypeConflicts,
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

	it("extracts Japanese Wikipedia articles from any linked comment position", () => {
		const links = findSyobocalWikipediaArticleLinks(`*memo
This uses [[work https://ja.wikipedia.org/wiki/Work_Title#Anime]] as a source.
-[[duplicate http://ja.wikipedia.org/wiki/Work_Title]]
-[[not an article https://ja.wikipedia.org/wiki/Category:Anime]]
-[[English Wikipedia https://en.wikipedia.org/wiki/Work_Title]]`);
		expect(links).toEqual([
			{
				name: "Wikipedia",
				url: "https://ja.wikipedia.org/wiki/Work_Title",
				articleTitle: "Work Title",
				basis: "comment_link",
			},
		]);
		expect(
			japaneseWikipediaArticleTitle(
				"https://ja.m.wikipedia.org/wiki/%E7%81%AB%E7%8B%A9%E3%82%8A%E3%81%AE%E7%8E%8B",
			),
		).toBe("火狩りの王");
		expect(japaneseWikipediaArticleTitle("https://ja.wikipedia.org/w/index.php?title=Work")).toBeNull();
	});

	it("turns Syobocal wikipedia keywords into article links", () => {
		expect(findSyobocalWikipediaKeywordLinks("alias,wikipedia:Work Title,wikipedia:Work Title")).toEqual([
			{
				name: "Wikipedia",
				url: "https://ja.wikipedia.org/wiki/Work_Title",
				articleTitle: "Work Title",
				basis: "keyword",
			},
		]);
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

	it("refuses undated pairs", () => {
		expect(
			matchSyobocalTitlesExactly(
				[{ malId: 1, title: "同名作品", firstYear: null, firstMonth: null }],
				[{ tid: 10, title: "同名作品", firstYear: 2026, firstMonth: 1 }],
			),
		).toEqual([]);
		// a same-titled TV parent and its mini both match one TID: ambiguous, none confirmed
		expect(
			matchSyobocalTitlesExactly(
				[
					{ malId: 1, title: "同名作品", firstYear: 2026, firstMonth: 1, mediaType: "TV" },
					{ malId: 2, title: "同名作品", firstYear: 2026, firstMonth: 1, mediaType: "ONA" },
				],
				[{ tid: 10, title: "同名作品", firstYear: 2026, firstMonth: 1, category: 1 }],
			),
		).toEqual([]);
	});
});

describe("syobocalTypeConflicts", () => {
	it("flags cross-format pairs and passes unknowns", () => {
		expect(syobocalTypeConflicts("ONA", 1)).toBe(true);
		expect(syobocalTypeConflicts("Movie", 1)).toBe(true);
		expect(syobocalTypeConflicts("Movie", 8)).toBe(false);
		expect(syobocalTypeConflicts("TV", 10)).toBe(false);
		expect(syobocalTypeConflicts("TV", 7)).toBe(true);
		// 劇場先行→TV放送の作品はしょぼい側がcat8のことがある（シャニマス型）
		expect(syobocalTypeConflicts("TV", 8)).toBe(false);
		expect(syobocalTypeConflicts(null, 1)).toBe(false);
		expect(syobocalTypeConflicts("TV", null)).toBe(false);
	});
});

describe("matchSyobocalTitlesByReading", () => {
	it("folds katakana to hiragana and mostly-Latin titles to a comparable key", () => {
		expect(kanaFoldTitle("シェンムー")).toBe("しぇんむー");
		expect(latinFoldTitle("Shenmue the Animation")).toBe("shenmuetheanimation");
		// a katakana title with an English suffix must not collapse to the suffix
		expect(latinFoldTitle("おね→ショタ←おね THE ANIMATION")).toBe(null);
	});

	it("matches across scripts via TitleYomi and folded titles with date agreement", () => {
		const matches = matchSyobocalTitlesByReading(
			[
				{ malId: 1, title: "アトリ", firstYear: 2026, firstMonth: 7 },
				{ malId: 2, title: "シェンムー", firstYear: 2026, firstMonth: 1 },
				{ malId: 3, title: "遠い作品", firstYear: 2010, firstMonth: 1 },
				// mostly-Latin titles pair via the shared fold (kanaFoldTitle keeps
				// Latin letters, so the kana: key wins before the latin: key)
				{ malId: 4, title: "Shangri-La Frontier", firstYear: 2026, firstMonth: 4 },
			],
			[
				{ tid: 10, title: "ATRI -My Dear Moments-", titleYomi: "あとり", firstYear: 2026, firstMonth: 7 },
				{ tid: 20, title: "Shenmue the Animation", titleYomi: "しぇんむー", firstYear: 2026, firstMonth: 2 },
				{ tid: 30, title: "遠い作品(新)", titleYomi: "とおいさくひん", firstYear: 2026, firstMonth: 1 },
				{
					tid: 40,
					title: "SHANGRI-LA FRONTIER",
					titleYomi: "しゃんぐりらふろんてぃあ",
					firstYear: 2026,
					firstMonth: 4,
				},
			],
		);
		expect(matches).toEqual([
			{ malId: 1, tid: 10, matchKey: "kana:あとり" },
			{ malId: 2, tid: 20, matchKey: "kana:しぇんむー" },
			{ malId: 4, tid: 40, matchKey: "kana:shangrilafrontier" },
		]);
	});

	it("stays silent on ambiguity and on pairs the exact matcher already owns", () => {
		// two TIDs sharing one reading: ambiguous, no match
		expect(
			matchSyobocalTitlesByReading(
				[{ malId: 1, title: "ふたご", firstYear: 2026, firstMonth: 1 }],
				[
					{ tid: 10, title: "フタゴ", titleYomi: "ふたご", firstYear: 2026, firstMonth: 1 },
					{ tid: 20, title: "双子", titleYomi: "ふたご", firstYear: 2026, firstMonth: 1 },
				],
			),
		).toEqual([]);
		// identical normalized titles are the exact matcher's job
		expect(
			matchSyobocalTitlesByReading(
				[{ malId: 1, title: "同じ題名", firstYear: 2026, firstMonth: 1 }],
				[{ tid: 10, title: "同じ題名", titleYomi: "おなじだいめい", firstYear: 2026, firstMonth: 1 }],
			),
		).toEqual([]);
	});
});
