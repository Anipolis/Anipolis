import { describe, expect, it } from "vitest";
import {
	type AnimeSearchHit,
	buildPostSearchFilter,
	buildTitlePrefixFilter,
	MAX_ANIME_MATCHES,
	mergeRankedAnimeMatches,
	quotedAnimeIdsForSearch,
	rankAnimeMatches,
	shouldMatchQuotedAnime,
} from "./post-search";

const hit = (
	id: number,
	title: string,
	title_en: string | null = null,
	title_yomi: string | null = null,
): AnimeSearchHit => ({
	id,
	title,
	title_en,
	title_yomi,
	cover_url: null,
});

describe("shouldMatchQuotedAnime", () => {
	it("uses anime matching only for queries of two or more characters", () => {
		expect(shouldMatchQuotedAnime("の")).toBe(false);
		expect(shouldMatchQuotedAnime(" の ")).toBe(false);
		expect(shouldMatchQuotedAnime("レイ")).toBe(true);
		expect(shouldMatchQuotedAnime("レイアース")).toBe(true);
	});

	it("counts code points, so a single emoji is still one character", () => {
		expect(shouldMatchQuotedAnime("🌸")).toBe(false);
	});
});

describe("buildPostSearchFilter", () => {
	it("falls back to body text only when no anime matched", () => {
		expect(buildPostSearchFilter("レイアース", [])).toBe('content.ilike."%レイアース%"');
	});

	it("adds quoted posts of the matched anime, excluding room, event and spoiler posts", () => {
		expect(buildPostSearchFilter("レイアース", [42, 7])).toBe(
			'content.ilike."%レイアース%",and(anime_id.in.(42,7),broadcast_room_session_id.is.null,event_id.is.null,cw_anime_id.is.null)',
		);
	});

	it("escapes LIKE wildcards and filter syntax in the query", () => {
		expect(buildPostSearchFilter('100%_"x",y', [])).toBe(String.raw`content.ilike."%100\\%\\_\"x\",y%"`);
	});

	it("drops invalid and duplicate ids", () => {
		expect(buildPostSearchFilter("x", [3, 3, Number.NaN, -1, 1.5])).toContain("anime_id.in.(3)");
	});
});

describe("quotedAnimeIdsForSearch", () => {
	it("uses every id up to the cap and none beyond it", () => {
		const within = Array.from({ length: MAX_ANIME_MATCHES }, (_, i) => hit(i + 1, `t${i}`));
		expect(quotedAnimeIdsForSearch(within)).toHaveLength(MAX_ANIME_MATCHES);
		expect(quotedAnimeIdsForSearch([...within, hit(999, "extra")])).toEqual([]);
	});
});

describe("buildTitlePrefixFilter", () => {
	it("matches the start of the title, English title or reading", () => {
		expect(buildTitlePrefixFilter(" れいあーす ")).toBe(
			'title.ilike."れいあーす%",title_en.ilike."れいあーす%",title_yomi.ilike."れいあーす%"',
		);
	});
});

describe("mergeRankedAnimeMatches", () => {
	it("dedupes across groups and ranks the union", () => {
		const merged = mergeRankedAnimeMatches(
			"レイアース",
			[hit(3, "レイアース")],
			[hit(1, "魔法騎士レイアース"), hit(3, "レイアース")],
		);
		expect(merged.map((a) => a.id)).toEqual([3, 1]);
	});
});

describe("rankAnimeMatches", () => {
	it("treats a reading match like a title match", () => {
		// 読みで完全一致した作品を、題名の部分一致より先に出す
		const ranked = rankAnimeMatches("れいあーす", [
			hit(1, "れいあーすのうた"),
			hit(2, "魔法騎士レイアース", null, "まじっくないとれいあーす"),
			hit(3, "レイアース", null, "れいあーす"),
		]);
		expect(ranked.map((a) => a.id)).toEqual([3, 1, 2]);
	});

	it("puts exact and prefix title matches before partial ones", () => {
		const ranked = rankAnimeMatches("レイアース", [
			hit(1, "魔法騎士レイアース"),
			hit(2, "レイアース2"),
			hit(3, "レイアース"),
		]);
		expect(ranked.map((a) => a.id)).toEqual([3, 2, 1]);
	});

	it("matches English titles case-insensitively and prefers shorter titles on ties", () => {
		const ranked = rankAnimeMatches("rayearth", [
			hit(1, "魔法騎士レイアース 2", "Magic Knight Rayearth 2"),
			hit(2, "魔法騎士レイアース", "Magic Knight Rayearth"),
			hit(3, "レイアース", "Rayearth"),
		]);
		expect(ranked.map((a) => a.id)).toEqual([3, 2, 1]);
	});
});
