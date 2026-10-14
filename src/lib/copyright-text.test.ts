import { describe, expect, it } from "vitest";
import { joinWrappedCopyrightLines } from "./copyright-text";

describe("joinWrappedCopyrightLines", () => {
	it("rejoins a notice that was wrapped right after a separator", () => {
		expect(
			joinWrappedCopyrightLines(["©くろかた／MFブックス／", "「治癒魔法の間違った使い方」製作委員会"]),
		).toEqual(["©くろかた／MFブックス／「治癒魔法の間違った使い方」製作委員会"]);
		expect(joinWrappedCopyrightLines(["© 内藤 騎之介 ／", "  ", "「異世界のんびり農家」製作委員会"])).toEqual([
			"© 内藤 騎之介 ／「異世界のんびり農家」製作委員会",
		]);
	});

	it("keeps separate lines apart when the line ends normally", () => {
		expect(joinWrappedCopyrightLines(["©2024 Example製作委員会", "当サイトの無断転載を禁じます"])).toEqual([
			"©2024 Example製作委員会",
			"当サイトの無断転載を禁じます",
		]);
	});
});
