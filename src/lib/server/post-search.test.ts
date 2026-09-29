import { describe, expect, it } from "vitest";
import {
	buildPostSearchFilter,
	MAX_ANIME_MATCHES,
	quotedAnimeIdsForSearch,
	shouldMatchQuotedAnime,
} from "./post-search";

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
		const within = Array.from({ length: MAX_ANIME_MATCHES }, (_, i) => i + 1);
		expect(quotedAnimeIdsForSearch(within)).toHaveLength(MAX_ANIME_MATCHES);
		expect(quotedAnimeIdsForSearch([...within, 999])).toEqual([]);
	});
});
