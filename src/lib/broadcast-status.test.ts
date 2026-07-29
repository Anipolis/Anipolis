import { describe, expect, it } from "vitest";
import { computeBroadcastStatus } from "./broadcast-status";

const TODAY = "2026-07-29";

describe("computeBroadcastStatus", () => {
	it("moves a scheduled TV anime from upcoming to airing on its start date", () => {
		const anime = { airedFrom: "2026-07-29", airedTo: null, type: "TV", status: "upcoming" };

		expect(computeBroadcastStatus(anime, "2026-07-28")).toBe("upcoming");
		expect(computeBroadcastStatus(anime, TODAY)).toBe("airing");
	});

	it("keeps an anime airing through its end date and finishes it the next day", () => {
		const anime = { airedFrom: "2026-07-01", airedTo: "2026-07-29", type: "TV", status: "airing" };

		expect(computeBroadcastStatus(anime, TODAY)).toBe("airing");
		expect(computeBroadcastStatus(anime, "2026-07-30")).toBe("finished");
	});

	it("uses the source status when historical TV data has no end date", () => {
		expect(
			computeBroadcastStatus({ airedFrom: "2023-01-10", airedTo: null, type: "TV", status: "finished" }, TODAY),
		).toBe("finished");
	});

	it("lets an explicit active date range override a stale finished status", () => {
		expect(
			computeBroadcastStatus(
				{ airedFrom: "2026-07-01", airedTo: "2026-09-30", type: "TV", status: "finished" },
				TODAY,
			),
		).toBe("airing");
	});

	it.each([
		"Movie",
		"ONA",
		"OVA",
		"TV Special",
		"Special",
	])("treats a started finite release without an end date as finished: %s", (type) => {
		expect(computeBroadcastStatus({ airedFrom: TODAY, airedTo: null, type, status: "upcoming" }, TODAY)).toBe(
			"finished",
		);
	});

	it("treats an airing finite release as started even when its start date is missing", () => {
		expect(computeBroadcastStatus({ airedFrom: null, airedTo: null, type: "ONA", status: "airing" }, TODAY)).toBe(
			"finished",
		);
	});

	it("falls back to source status when dates are unavailable", () => {
		expect(computeBroadcastStatus({ airedFrom: null, airedTo: null, type: "TV", status: "finished" }, TODAY)).toBe(
			"finished",
		);
		expect(computeBroadcastStatus({ airedFrom: null, airedTo: null, type: "TV", status: "upcoming" }, TODAY)).toBe(
			"upcoming",
		);
		expect(computeBroadcastStatus({ airedFrom: null, airedTo: null, type: "TV", status: "airing" }, TODAY)).toBe(
			"airing",
		);
	});
});
