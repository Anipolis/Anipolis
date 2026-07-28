import { describe, expect, it } from "vitest";
import { rollingSyobocalProgramRange, selectPrimarySyobocalPrograms } from "./syobocal-schedule";

describe("selectPrimarySyobocalPrograms", () => {
	it("uses FirstCh for each episode and falls back to the earliest channel", () => {
		const selected = selectPrimarySyobocalPrograms(
			[{ malId: 1, tid: 10, validFrom: null, validTo: null }],
			[{ tid: 10, firstChannel: "TOKYO MX" }],
			[
				{ chid: 1, name: "BS11", epgName: null },
				{ chid: 2, name: "TOKYO MX", epgName: null },
			],
			[
				{
					pid: 1,
					tid: 10,
					chid: 1,
					startsAt: "2026-07-01T14:00:00.000Z",
					endsAt: "2026-07-01T14:30:00.000Z",
					episodeNumber: 1,
					subtitle: null,
					deleted: false,
				},
				{
					pid: 2,
					tid: 10,
					chid: 2,
					startsAt: "2026-07-01T15:00:00.000Z",
					endsAt: "2026-07-01T15:30:00.000Z",
					episodeNumber: 1,
					subtitle: null,
					deleted: false,
				},
			],
		);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toMatchObject({ pid: 2, malId: 1, channelName: "TOKYO MX" });
	});

	it("uses validity dates to split one TID across MAL identities", () => {
		const selected = selectPrimarySyobocalPrograms(
			[
				{ malId: 1, tid: 10, validFrom: "2026-01-01", validTo: "2026-03-31" },
				{ malId: 2, tid: 10, validFrom: "2026-04-01", validTo: "2026-06-30" },
			],
			[{ tid: 10, firstChannel: null }],
			[{ chid: 1, name: "BS11", epgName: null }],
			[
				{
					pid: 1,
					tid: 10,
					chid: 1,
					startsAt: "2026-01-01T15:00:00.000Z",
					endsAt: "2026-01-01T15:30:00.000Z",
					episodeNumber: 1,
					subtitle: null,
					deleted: false,
				},
				{
					pid: 2,
					tid: 10,
					chid: 1,
					startsAt: "2026-04-01T15:00:00.000Z",
					endsAt: "2026-04-01T15:30:00.000Z",
					episodeNumber: 2,
					subtitle: null,
					deleted: false,
				},
			],
		);
		expect(selected.map((program) => [program.malId, program.pid])).toEqual([
			[1, 1],
			[2, 2],
		]);
	});
});

describe("rollingSyobocalProgramRange", () => {
	it("intersects a season with yesterday through 90 days ahead", () => {
		expect(rollingSyobocalProgramRange("2026-07-01", "2026-10-01", new Date("2026-07-29T03:00:00Z"))).toEqual({
			startDate: "2026-07-28",
			endDate: "2026-10-01",
			apiRange: "20260728_000000-20261001_000000",
		});
		expect(rollingSyobocalProgramRange("2023-01-01", "2023-04-01", new Date("2026-07-29T03:00:00Z"))).toBeNull();
	});
});
