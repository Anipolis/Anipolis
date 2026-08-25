import { describe, expect, it } from "vitest";
import { rollingSyobocalProgramRange, selectPrimarySyobocalPrograms } from "./syobocal-schedule";

describe("selectPrimarySyobocalPrograms", () => {
	it("uses FirstCh for each episode and falls back to the earliest channel", () => {
		const selected = selectPrimarySyobocalPrograms(
			[{ malId: 1, tid: 10, validFrom: null, validTo: null }],
			[{ tid: 10, firstChannel: "TOKYO MX" }],
			[
				{ chid: 1, name: "BS11", epgName: null, channelGroupId: 2 },
				{ chid: 2, name: "TOKYO MX", epgName: null, channelGroupId: 1 },
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
			[{ chid: 1, name: "BS11", epgName: null, channelGroupId: 2 }],
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

	it("excludes CS/web channels and prefers the earliest terrestrial airing over BS", () => {
		const base = {
			tid: 10,
			endsAt: "2026-07-01T15:00:00.000Z",
			episodeNumber: 1,
			subtitle: null,
			deleted: false,
		};
		const selected = selectPrimarySyobocalPrograms(
			[{ malId: 1, tid: 10, validFrom: null, validTo: null }],
			[{ tid: 10, firstChannel: "AT-X" }],
			[
				{ chid: 1, name: "AT-X", epgName: null, channelGroupId: 6 },
				{ chid: 2, name: "BS11", epgName: null, channelGroupId: 2 },
				{ chid: 3, name: "TOKYO MX", epgName: null, channelGroupId: 1 },
				{ chid: 4, name: "サンテレビ", epgName: null, channelGroupId: 8 },
			],
			[
				// AT-X pre-airs first but is CS: never selected even as FirstCh.
				{ ...base, pid: 1, chid: 1, startsAt: "2026-06-29T12:00:00.000Z" },
				// BS airs before both terrestrials but loses to the terrestrial tier.
				{ ...base, pid: 2, chid: 2, startsAt: "2026-06-30T12:00:00.000Z" },
				{ ...base, pid: 3, chid: 3, startsAt: "2026-07-01T14:00:00.000Z" },
				// earliest terrestrial wins across regions
				{ ...base, pid: 4, chid: 4, startsAt: "2026-07-01T13:00:00.000Z" },
			],
		);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toMatchObject({ pid: 4, channelName: "サンテレビ" });
	});

	it("falls back to BS when a title has no terrestrial airing", () => {
		const selected = selectPrimarySyobocalPrograms(
			[{ malId: 1, tid: 10, validFrom: null, validTo: null }],
			[{ tid: 10, firstChannel: null }],
			[
				{ chid: 1, name: "AT-X", epgName: null, channelGroupId: 6 },
				{ chid: 2, name: "BS11", epgName: null, channelGroupId: 2 },
			],
			[
				{
					pid: 1,
					tid: 10,
					chid: 1,
					startsAt: "2026-07-01T12:00:00.000Z",
					endsAt: "2026-07-01T12:30:00.000Z",
					episodeNumber: 1,
					subtitle: null,
					deleted: false,
				},
				{
					pid: 2,
					tid: 10,
					chid: 2,
					startsAt: "2026-07-02T12:00:00.000Z",
					endsAt: "2026-07-02T12:30:00.000Z",
					episodeNumber: 1,
					subtitle: null,
					deleted: false,
				},
			],
		);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toMatchObject({ pid: 2, channelName: "BS11" });
	});

	it("skips rerun slots but keeps recap specials for the override system", () => {
		const base = {
			tid: 10,
			chid: 1,
			endsAt: "2026-07-01T15:00:00.000Z",
			deleted: false,
		};
		const selected = selectPrimarySyobocalPrograms(
			[{ malId: 1, tid: 10, validFrom: null, validTo: null }],
			[{ tid: 10, firstChannel: null }],
			[{ chid: 1, name: "TOKYO MX", epgName: null, channelGroupId: 1 }],
			[
				// rerun of episode 1 (Flag bit 8): would duplicate its room
				{ ...base, pid: 1, startsAt: "2026-07-01T14:00:00.000Z", episodeNumber: 1, subtitle: null, flags: 8 },
				// unnumbered recap special: opens a room; the broadcast room override
				// system (総集編/一挙放送) labels it and holds the episode counter
				{
					...base,
					pid: 2,
					startsAt: "2026-07-02T14:00:00.000Z",
					episodeNumber: null,
					subtitle: "総集編スペシャル",
				},
				// the real episode 2 (final-episode flag must not be skipped)
				{
					...base,
					pid: 3,
					startsAt: "2026-07-03T14:00:00.000Z",
					episodeNumber: 2,
					subtitle: "最終話",
					flags: 4,
				},
			],
		);
		expect(selected.map((program) => program.pid)).toEqual([2, 3]);
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
