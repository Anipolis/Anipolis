import { describe, expect, it } from "vitest";
import { animeIsScheduledForRoomDate } from "./broadcast-room";

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
});
