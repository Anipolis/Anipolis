import { describe, expect, it } from "vitest";
import { formatCompactCount, formatCount } from "./format";

describe("formatCount", () => {
	it("3桁ごとに区切る", () => {
		expect(formatCount(3)).toBe("3");
		expect(formatCount(12345)).toBe("12,345");
	});
});

describe("formatCompactCount", () => {
	it.each([
		[9999, "9,999"],
		[10_000, "1万"],
		[12_345, "1.2万"],
		[19_999, "1.9万"],
		[123_456, "12万"],
		[3_450_000, "345万"],
		[123_000_000, "1.2億"],
	])("%d → %s", (value, expected) => {
		expect(formatCompactCount(value)).toBe(expected);
	});
});
