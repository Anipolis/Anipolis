import { describe, expect, it } from "vitest";
import {
	annictTwitterUrl,
	copyrightComparisonKey,
	dedupeCopyrightCandidates,
	looseCopyrightKey,
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
		// Ⓒ は NFKC で英字の C になるので、正規化前に取り除く
		expect(copyrightComparisonKey("Ⓒ有山リョウ／小学館")).toBe(copyrightComparisonKey("©有山リョウ/小学館"));
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

describe("looseCopyrightKey", () => {
	it("treats year, separator, mark and company-suffix differences as the same notice", () => {
		const same = [
			["©1990 東宝・マッドハウス", "©東宝 / マッドハウス"],
			["©2008 DLEInc.", "©DLE"],
			["Ⓒ有山リョウ／小学館", "©有山リョウ/小学館"],
			["© 2020 水無月すう／KADOKAWA／プランダラ製作委員会", "©水無月すう／KADOKAWA／プランダラ製作委員会"],
			["©2017 Sumitomo Rubber Industries, Ltd. All rights reserved.", "©2018 Sumitomo Rubber Industries, Ltd."],
		];
		for (const [left, right] of same)
			expect(looseCopyrightKey(left as string)).toBe(looseCopyrightKey(right as string));
	});

	it("still separates different committees and seasons", () => {
		expect(looseCopyrightKey("©Roy・ホビージャパン／『神達に拾われた男』製作委員会")).not.toBe(
			looseCopyrightKey("©Roy・ホビージャパン／『神達に拾われた男2』製作委員会"),
		);
		expect(looseCopyrightKey("©PQC")).not.toBe(looseCopyrightKey("©VAP"));
	});

	it("keeps the newest-year notice when collapsing candidates", () => {
		expect(
			dedupeCopyrightCandidates([
				"ⒸSakuSakamoto / zelicofilm,LLC",
				"© 2022 Saku Sakamoto / zelicofilm,LLC All Rights Reserved",
				"©VAP",
			]),
		).toEqual(["© 2022 Saku Sakamoto / zelicofilm,LLC All Rights Reserved", "©VAP"]);
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
