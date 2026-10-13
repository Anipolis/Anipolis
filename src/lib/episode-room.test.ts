import { describe, expect, it } from "vitest";
import {
	airingAt,
	airingHeading,
	episodeRoomPath,
	formatAiringTime,
	hasEpisodeRooms,
	parseEpisodeNumberParam,
} from "./episode-room";
import type { RoomAiring } from "./types";

function airing(id: string, opens: string, closes: string, kind: RoomAiring["airing_kind"] = "first"): RoomAiring {
	return {
		id,
		scheduled_at: new Date(Date.parse(opens) + 5 * 60_000).toISOString(),
		posting_opens_at: opens,
		posting_closes_at: closes,
		airing_kind: kind,
		channel_name: "TOKYO MX",
	};
}

describe("hasEpisodeRooms（153 の ensure_episode_room と同じ条件）", () => {
	it.each([
		[{ type: "TV", episode_total: null }, true],
		[{ type: "ONA", episode_total: 8 }, true],
		[{ type: "OVA", episode_total: 2 }, true],
		[{ type: "OVA", episode_total: 1 }, false],
		[{ type: "ONA", episode_total: null }, false],
		[{ type: "Movie", episode_total: 1 }, false],
		[{ type: "Special", episode_total: 3 }, false],
		[{ type: "TV", room_type: "global", episode_total: 12 }, false],
	])("%o → %s", (anime, expected) => {
		expect(hasEpisodeRooms(anime)).toBe(expected);
	});
});

describe("URL", () => {
	it("話数ルームの URL と放送枠の指定", () => {
		expect(episodeRoomPath(12, 3)).toBe("/rooms/anime/12/ep/3");
		expect(episodeRoomPath("12", 3, "abc")).toBe("/rooms/anime/12/ep/3?airing=abc");
	});

	it("URL の話数は正の整数だけ", () => {
		expect(parseEpisodeNumberParam("3")).toBe(3);
		expect(parseEpisodeNumberParam("1200")).toBe(1200);
		for (const bad of ["0", "-1", "03", "3.5", "abc", "", "12345"]) expect(parseEpisodeNumberParam(bad)).toBeNull();
	});
});

describe("airingAt", () => {
	const first = airing("first", "2026-10-05T14:25:00Z", "2026-10-05T15:30:00Z");
	const rerun = airing("rerun", "2026-10-12T14:25:00Z", "2026-10-12T15:30:00Z", "rerun");

	it("投稿受付の時間帯に入る放送枠を返し、時間外は null", () => {
		expect(airingAt([first, rerun], "2026-10-05T14:40:00Z")?.id).toBe("first");
		expect(airingAt([first, rerun], "2026-10-12T15:30:00Z")?.id).toBe("rerun");
		expect(airingAt([first, rerun], "2026-10-08T00:00:00Z")).toBeNull();
		expect(airingAt([], Date.now())).toBeNull();
	});

	it("重なるときは後に始まった枠", () => {
		const overlap = airing("late", "2026-10-05T15:00:00Z", "2026-10-05T16:00:00Z", "event");
		expect(airingAt([first, overlap], "2026-10-05T15:10:00Z")?.id).toBe("late");
	});
});

describe("見出し", () => {
	it("JST で「種類 月/日(曜) 時:分 局名」", () => {
		expect(formatAiringTime("2026-10-05T14:30:00Z")).toBe("10/5(月) 23:30");
		expect(airingHeading(airing("x", "2026-10-05T14:25:00Z", "2026-10-05T15:30:00Z", "rerun"))).toBe(
			"再放送 10/5(月) 23:30 TOKYO MX",
		);
	});
});
