import { describe, expect, it } from "vitest";
import {
	annictTwitterUrl,
	copyrightComparisonKey,
	normalizeAnnictCopyright,
	normalizeAnnictOfficialSiteUrl,
} from "./annict";

describe("normalizeAnnictCopyright", () => {
	it("prefixes the © mark that Annict leaves to its renderer", () => {
		expect(normalizeAnnictCopyright("ねことうふ・一迅社／「おにまい」製作委員会")).toBe(
			"©ねことうふ・一迅社／「おにまい」製作委員会",
		);
		expect(normalizeAnnictCopyright("防衛隊第3部隊 ©松本直也／集英社")).toBe("©防衛隊第3部隊 ©松本直也／集英社");
	});

	it("keeps an existing leading mark and drops blanks", () => {
		expect(normalizeAnnictCopyright("Ⓒ 2024 Example")).toBe("Ⓒ 2024 Example");
		expect(normalizeAnnictCopyright("  ")).toBeNull();
		expect(normalizeAnnictCopyright(null)).toBeNull();
	});
});

describe("copyrightComparisonKey", () => {
	it("ignores marks, spacing, slash width and boilerplate", () => {
		expect(copyrightComparisonKey("©2023 鴉ぴえろ・きさらぎゆり／ KADOKAWA／ 転天製作委員会")).toBe(
			copyrightComparisonKey("2023 鴉ぴえろ・きさらぎゆり/KADOKAWA/転天製作委員会"),
		);
		expect(copyrightComparisonKey("©2024 Soul Games, Inc. All Rights Reserved.")).toBe(
			copyrightComparisonKey("2024 Soul Games, Inc."),
		);
	});

	it("keeps season-specific committee names apart", () => {
		expect(copyrightComparisonKey("©Roy・ホビージャパン／『神達に拾われた男』製作委員会")).not.toBe(
			copyrightComparisonKey("©Roy・ホビージャパン／『神達に拾われた男2』製作委員会"),
		);
	});
});

describe("Annict links", () => {
	it("accepts only absolute site URLs and valid X handles", () => {
		expect(normalizeAnnictOfficialSiteUrl("https://example.com/anime/")).toBe("https://example.com/anime/");
		expect(normalizeAnnictOfficialSiteUrl("example.com")).toBeNull();
		expect(annictTwitterUrl("@keroro_anime")).toBe("https://x.com/keroro_anime");
		expect(annictTwitterUrl("bad handle")).toBeNull();
	});
});
