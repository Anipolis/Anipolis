import { describe, expect, it } from "vitest";
import { animeIsScheduledForRoomDate, isValidRoomDate } from "./broadcast-room";

describe("animeIsScheduledForRoomDate", () => {
	it("rejects a weekly room date before the anime starts airing", () => {
		expect.assertions(1);

		expect(
			animeIsScheduledForRoomDate(
				{
					aired_from: "2026-07-12",
					aired_to: null,
					broadcast_day: 0,
				},
				"2026-07-05",
			),
		).toBe(false);
	});

	it("accepts a regular room date on or after the anime starts airing", () => {
		expect.assertions(1);

		expect(
			animeIsScheduledForRoomDate(
				{
					aired_from: "2026-07-12",
					aired_to: null,
					broadcast_day: 0,
				},
				"2026-07-12",
			),
		).toBe(true);
	});

	it("lets override dates bypass the regular weekday check", () => {
		expect.assertions(1);

		expect(
			animeIsScheduledForRoomDate(
				{
					aired_from: "2026-07-12",
					aired_to: null,
					broadcast_day: 0,
				},
				"2026-07-13",
				true,
			),
		).toBe(true);
	});

	it("keeps override dates bounded by the anime airing start", () => {
		expect.assertions(1);

		expect(
			animeIsScheduledForRoomDate(
				{
					aired_from: "2026-07-12",
					aired_to: null,
					broadcast_day: 0,
				},
				"2026-07-05",
				true,
			),
		).toBe(false);
	});

	it("rejects invalid calendar dates", () => {
		expect.assertions(1);

		expect(
			animeIsScheduledForRoomDate(
				{
					aired_from: "2026-02-01",
					aired_to: null,
					broadcast_day: 2,
				},
				"2026-02-31",
			),
		).toBe(false);
	});

	it.each([
		["2024-02-29", true],
		["2026-02-29", false],
		["2026-02-30", false],
		["2026-02-31", false],
		["2026-04-30", true],
		["2026-04-31", false],
		["2026-13-01", false],
	] as const)("validates the calendar date %s", (value, expected) => {
		expect(isValidRoomDate(value)).toBe(expected);
	});
});
