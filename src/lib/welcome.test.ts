import { describe, expect, it } from "vitest";
import { isWithinWelcomePeriod } from "./welcome.ts";

describe("isWithinWelcomePeriod", () => {
	const now = new Date("2026-11-18T12:00:00Z");

	it("登録から 30 日未満なら出す", () => {
		expect(isWithinWelcomePeriod("2026-11-18T11:00:00Z", now)).toBe(true);
		expect(isWithinWelcomePeriod("2026-10-19T12:00:01Z", now)).toBe(true);
	});

	it("30 日たったら出さない", () => {
		expect(isWithinWelcomePeriod("2026-10-19T12:00:00Z", now)).toBe(false);
		expect(isWithinWelcomePeriod("2025-01-01T00:00:00Z", now)).toBe(false);
	});

	it("登録日が読めなければ出さない", () => {
		expect(isWithinWelcomePeriod(undefined, now)).toBe(false);
		expect(isWithinWelcomePeriod("", now)).toBe(false);
		expect(isWithinWelcomePeriod("not a date", now)).toBe(false);
	});
});
