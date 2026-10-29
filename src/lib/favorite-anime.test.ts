import { describe, expect, it } from "vitest";
import { favoriteAnimeMeta } from "./favorite-anime";

describe("ベスト作品の検索結果の補足", () => {
	it.each([
		[{ aired_from: "2018-04-07", type: "TV" }, "2018年・TV"],
		[{ aired_from: "1988-12-01", type: "OVA" }, "1988年・OVA"],
		[{ aired_from: "2021-03-08", type: "Movie" }, "2021年・映画"],
		[{ aired_from: "2023-07-14", type: "ONA" }, "2023年・Web"],
		[{ aired_from: null, type: "Special" }, "特別"],
		[{ aired_from: "2020-01-01", type: null }, "2020年"],
		[{}, ""],
	])("%o → %s", (anime, expected) => {
		expect(favoriteAnimeMeta(anime)).toBe(expected);
	});
});
