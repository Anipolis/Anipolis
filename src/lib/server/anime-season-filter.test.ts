import { describe, expect, it } from "vitest";
import { buildSeasonFilter } from "./queries";

describe("buildSeasonFilter", () => {
	it("combines the selected year and Japanese season against the season field", () => {
		const filter = buildSeasonFilter("2023", ["冬"]);

		expect(filter).toContain('season.ilike."2023%冬"');
		expect(filter).toContain('season.ilike."2023%winter"');
	});

	it("filters a year without requiring aired_from", () => {
		expect(buildSeasonFilter("2023", [])).toBe('season.ilike."2023%"');
	});
});
