import { describe, expect, it } from "vitest";
import { pickCopyrightForSeason, resolveSeasonNumber, titleSeasonNumber } from "./copyright-season";

describe("titleSeasonNumber", () => {
	it("reads explicit season markers and trailing numbers", () => {
		expect(titleSeasonNumber("わたしの幸せな結婚 第二期")).toBe(2);
		expect(titleSeasonNumber("虚構推理 Season2")).toBe(2);
		expect(titleSeasonNumber("黒執事II: シエル・イン・ワンダーランド")).toBe(2);
		expect(titleSeasonNumber("神達に拾われた男2")).toBe(2);
		expect(titleSeasonNumber("やはり俺の青春ラブコメはまちがっている。続")).toBe(2);
	});

	it("returns null when the title has no explicit season", () => {
		expect(titleSeasonNumber("TRIGUN STAMPEDE")).toBeNull();
		expect(titleSeasonNumber("イジらないで、長瀞さん 2nd Attack")).toBeNull();
	});
});

describe("resolveSeasonNumber", () => {
	it("falls back to the prequel chain for subtitle-only sequels", () => {
		expect(resolveSeasonNumber("ツルネ －つながりの一射－", 2)).toBe(2);
		expect(resolveSeasonNumber("イジらないで、長瀞さん 2nd Attack", 2)).toBe(2);
		expect(resolveSeasonNumber("虚構推理 Season2", 3)).toBe(2);
		expect(resolveSeasonNumber("TRIGUN STAMPEDE", null)).toBe(1);
	});
});

describe("pickCopyrightForSeason", () => {
	const tsurune1 = "©綾野ことこ・京都アニメーション/ツルネ製作委員会";
	const tsurune2 = "©綾野ことこ・京都アニメーション/ツルネⅡ製作委員会";

	it("picks the committee of the work's season when candidates differ only by season", () => {
		const s1 = "©Roy・ホビージャパン／『神達に拾われた男』製作委員会";
		const s2 = "©Roy・ホビージャパン／『神達に拾われた男2』製作委員会";
		expect(pickCopyrightForSeason(2, [s1, s2])).toBe(s2);
		expect(pickCopyrightForSeason(1, [s1, s2])).toBe(s1);
		expect(pickCopyrightForSeason(2, [tsurune1, tsurune2])).toBe(tsurune2);
	});

	it("leaves it to people when no candidate matches or the difference is not the season", () => {
		expect(pickCopyrightForSeason(3, [tsurune1, tsurune2])).toBeNull();
		expect(
			pickCopyrightForSeason(1, ["©2020 安里アサト/KADOKAWA/86製作委員会", "©安里アサト/KADOKAWA/86製作委員会"]),
		).toBeNull();
		expect(
			pickCopyrightForSeason(1, [
				"©雪森寧々／集英社・久保さん製作委員会",
				"©「久保さんは僕を許さない」製作委員会",
			]),
		).toBeNull();
	});
});
