import { describe, expect, it } from "vitest";
import { extractHashtags, isHashtagName } from "./hashtag";

describe("extractHashtags", () => {
	it("「々」や全角英数字で途中で切らない", () => {
		expect(extractHashtags("#佐々木と宮野 と #けもフレ３ と #魔女の旅々")).toEqual([
			"佐々木と宮野",
			"けもフレ３",
			"魔女の旅々",
		]);
	});

	it("句読点や記号の手前で終わる", () => {
		expect(extractHashtags("#君の名は。最高")).toEqual(["君の名は"]);
	});
});

describe("isHashtagName", () => {
	it("ハッシュタグとしてそのまま通る名前だけを受け付ける", () => {
		expect(isHashtagName("佐々木と宮野")).toBe(true);
		expect(isHashtagName("anime_eupho")).toBe(true);
		expect(isHashtagName("君の名は。")).toBe(false);
		expect(isHashtagName("ゆるキャン△")).toBe(false);
		expect(isHashtagName("")).toBe(false);
	});
});
