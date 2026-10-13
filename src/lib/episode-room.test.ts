import { describe, expect, it } from "vitest";
import {
	airingAt,
	airingHeading,
	buildEpisodeRoomList,
	episodeRoomPath,
	formatAiringTime,
	hasEpisodeRooms,
	isEpisodeRoomEntryLive,
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

describe("buildEpisodeRoomList（作品ページの話数ルーム一覧）", () => {
	const now = Date.parse("2026-10-14T00:00:00Z");
	const room = (
		id: string,
		episode: number | null,
		opens: string | null,
		extra: Partial<import("./types").EpisodeRoom> = {},
	) => ({
		id,
		anime_id: 1,
		kind: "episode" as const,
		episode_number: episode,
		special_key: null,
		label: null,
		opens_at: opens,
		merged_into: null,
		...extra,
	});

	it("第1話から作品の話数までを並べ、ルームの状態と初回放送日を付ける", () => {
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [room("r1", 1, "2026-10-01T14:25:00Z"), room("r2", 2, "2026-10-21T14:25:00Z")],
			airings: [
				{ ...airing("a1", "2026-10-01T14:25:00Z", "2026-10-01T15:30:00Z"), episode_room_id: "r1" },
				{ ...airing("a1r", "2026-10-08T14:25:00Z", "2026-10-08T15:30:00Z", "rerun"), episode_room_id: "r1" },
			],
			episodeTotal: 3,
			now,
		});
		expect(list.map((entry) => [entry.label, entry.state, entry.firstAiredAt])).toEqual([
			["第1話", "open", "2026-10-01T14:30:00.000Z"],
			["第2話", "upcoming", null],
			["第3話", "unaired", null],
		]);
		expect(list[0]?.href).toBe("/rooms/anime/1/ep/1");
		expect(list[0]?.windows).toHaveLength(2);
	});

	it("話数が不明なら作られたルームの最大話数まで。統合済みのルームは出さず、特番は後ろに並べる", () => {
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [
				room("r1", 1, "2026-10-01T00:00:00Z"),
				room("r4", 4, "2026-10-01T00:00:00Z", { merged_into: "r1" }),
				room("r2", 2, "2026-10-01T00:00:00Z"),
				{
					...room("sp", null, "2026-10-01T00:00:00Z"),
					kind: "special" as const,
					special_key: "recap",
					label: "総集編",
				},
			],
			airings: [],
			episodeTotal: null,
			now,
		});
		expect(list.map((entry) => entry.label)).toEqual(["第1話", "第2話", "総集編"]);
		expect(list.at(-1)?.href).toBe("/rooms/anime/1/sp/recap");
	});

	it("ルームも話数も無ければ空", () => {
		expect(buildEpisodeRoomList({ animeId: 1, rooms: [], airings: [], episodeTotal: null, now })).toEqual([]);
	});

	it("放送枠の時間内にある行は LIVE", () => {
		const entry = { windows: [{ opens: "2026-10-14T00:00:00Z", closes: "2026-10-14T01:00:00Z" }] };
		expect(isEpisodeRoomEntryLive(entry, Date.parse("2026-10-14T00:30:00Z"))).toBe(true);
		expect(isEpisodeRoomEntryLive(entry, Date.parse("2026-10-14T01:30:00Z"))).toBe(false);
	});
});
