import { describe, expect, it } from "vitest";
import {
	airingAt,
	airingHeading,
	airingOnAirAt,
	buildEpisodeRoomList,
	type EpisodeRoomListEntry,
	episodeRoomEntryState,
	episodeRoomPath,
	formatAiringDate,
	formatAiringTime,
	hasEpisodeRooms,
	isEpisodeRoomEntryLive,
	MAX_EPISODE_NUMBER,
	openableEpisodeLimit,
	parseEpisodeNumberParam,
} from "./episode-room";
import type { EpisodeRoom, RoomAiring } from "./types";

function airing(id: string, opens: string, closes: string, kind: RoomAiring["airing_kind"] = "first"): RoomAiring {
	return {
		id,
		scheduled_at: new Date(Date.parse(opens) + 5 * 60_000).toISOString(),
		ends_at: new Date(Date.parse(opens) + 35 * 60_000).toISOString(),
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

describe("airingOnAirAt（放送中の判定）", () => {
	it("開場から放送の終わりまで。放送後の感想受付の時間は放送中にしない", () => {
		const first = airing("first", "2026-10-05T14:25:00Z", "2026-10-05T15:30:00Z");
		expect(airingOnAirAt([first], Date.parse("2026-10-05T14:26:00Z"))?.id).toBe("first");
		expect(airingOnAirAt([first], Date.parse("2026-10-05T15:00:00Z"))?.id).toBe("first");
		// 放送の終わり（14:30 + 30分 = 15:00）を過ぎた感想受付の時間
		expect(airingOnAirAt([first], Date.parse("2026-10-05T15:10:00Z"))).toBeNull();
		expect(airingAt([first], "2026-10-05T15:10:00Z")?.id).toBe("first");
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
		extra: Partial<EpisodeRoom> = {},
	): EpisodeRoom => ({
		id,
		anime_id: 1,
		kind: "episode",
		episode_number: episode,
		special_key: null,
		label: null,
		opens_at: opens,
		merged_into: null,
		...extra,
	});
	const withRoom = (a: RoomAiring, roomId: string) => ({ ...a, episode_room_id: roomId });

	it("第1話から作品の話数までを並べ、開く時刻と初回放送日を付ける", () => {
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [room("r1", 1, "2026-10-01T14:25:00Z"), room("r2", 2, "2026-10-21T14:25:00Z")],
			airings: [
				withRoom(airing("a1", "2026-10-01T14:25:00Z", "2026-10-01T15:30:00Z"), "r1"),
				withRoom(airing("a1r", "2026-10-08T14:25:00Z", "2026-10-08T15:30:00Z", "rerun"), "r1"),
			],
			episodeTotal: 3,
		});
		expect(list.map((entry) => [entry.label, episodeRoomEntryState(entry, now), entry.firstAiredOn])).toEqual([
			["第1話", "open", "2026-10-01"],
			["第2話", "upcoming", null],
			["第3話", "unaired", null],
		]);
		expect(list[0]?.href).toBe("/rooms/anime/1/ep/1");
		expect(list[0]?.windows).toHaveLength(2);
		// 開く時刻を過ぎれば、同じ行でも状態が変わる（ページを開いたまま）
		const second = list[1] as EpisodeRoomListEntry;
		expect(episodeRoomEntryState(second, Date.parse("2026-10-21T14:26:00Z"))).toBe("open");
	});

	it("話数は URL で開ける 9999 話までしか並べない（誤った話数のデータで一覧を際限なく作らない）", () => {
		const list = buildEpisodeRoomList({ animeId: 1, rooms: [], airings: [], episodeTotal: 999_999_999 });
		expect(list).toHaveLength(MAX_EPISODE_NUMBER);
		expect(list.at(-1)?.href).toBe(`/rooms/anime/1/ep/${MAX_EPISODE_NUMBER}`);
		expect(parseEpisodeNumberParam(String(MAX_EPISODE_NUMBER))).toBe(MAX_EPISODE_NUMBER);
	});

	it("ルームが無くても開ける話（ensure_episode_room がすぐ作る話）は投稿できる行にする", () => {
		const list = buildEpisodeRoomList({ animeId: 1, rooms: [], airings: [], episodeTotal: 3, openableUpTo: 2 });
		expect(list.map((entry) => episodeRoomEntryState(entry, now))).toEqual(["open", "open", "unaired"]);
	});

	it("統合した話数は出さず、特番は後ろにリンク無しで並べる", () => {
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [
				room("r1", 1, "2026-10-01T00:00:00Z"),
				room("r2", 2, "2026-10-01T00:00:00Z"),
				room("r3", 3, "2026-10-01T00:00:00Z"),
				room("r4", 4, "2026-10-01T00:00:00Z", { merged_into: "r3" }),
				room("sp", null, "2026-10-01T00:00:00Z", { kind: "special", special_key: "recap", label: "総集編" }),
			],
			airings: [],
			episodeTotal: 4,
		});
		expect(list.map((entry) => entry.label)).toEqual(["第1話", "第2話", "第3話", "総集編"]);
		expect(list.at(-1)?.href).toBeNull();
	});

	it("話数が不明なら作られたルームの最大話数まで。ルームも話数も無ければ空", () => {
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [room("r1", 1, "2026-10-01T00:00:00Z"), room("r2", 2, "2026-10-01T00:00:00Z")],
			airings: [],
			episodeTotal: null,
		});
		expect(list.map((entry) => entry.label)).toEqual(["第1話", "第2話"]);
		expect(buildEpisodeRoomList({ animeId: 1, rooms: [], airings: [], episodeTotal: null })).toEqual([]);
	});

	it("LIVE は放送枠の開場から放送の終わりまで", () => {
		const entry = { windows: [{ opens: "2026-10-14T00:00:00Z", closes: "2026-10-14T00:35:00Z" }] };
		expect(isEpisodeRoomEntryLive(entry, Date.parse("2026-10-14T00:30:00Z"))).toBe(true);
		expect(isEpisodeRoomEntryLive(entry, Date.parse("2026-10-14T00:50:00Z"))).toBe(false);
	});

	it("初回放送日は放送日（朝4時区切り）を使い、無ければ JST の日付", () => {
		expect(formatAiringDate("2026-10-05T16:00:00Z")).toBe("2026-10-06");
		const lateNight = { ...airing("ln", "2026-10-13T15:25:00Z", "2026-10-13T16:30:00Z"), episode_room_id: "r1" };
		const list = buildEpisodeRoomList({
			animeId: 1,
			rooms: [room("r1", 1, "2026-10-13T15:25:00Z")],
			airings: [{ ...lateNight, room_date: "2026-10-13" }],
			episodeTotal: 1,
		});
		// 10/14 0:30 JST の深夜放送は 10/13 の放送
		expect(list[0]?.firstAiredOn).toBe("2026-10-13");
		const withoutDate = buildEpisodeRoomList({
			animeId: 1,
			rooms: [room("r1", 1, null)],
			airings: [lateNight],
			episodeTotal: 1,
		});
		expect(withoutDate[0]?.firstAiredOn).toBe("2026-10-14");
	});
});

describe("openableEpisodeLimit（ensure_episode_room と同じ判断）", () => {
	const now = Date.parse("2026-10-14T00:00:00Z");
	const base = { type: "TV", status: "airing", aired_from: "2026-10-01", episode_total: 12 };
	const r = (id: string, n: number): EpisodeRoom => ({
		id,
		anime_id: 1,
		kind: "episode",
		episode_number: n,
		special_key: null,
		label: null,
		opens_at: null,
		merged_into: null,
	});

	it("放送枠のある作品は開場済みの最大話数まで", () => {
		const airings = [
			{ ...airing("a", "2026-10-07T14:25:00Z", "2026-10-07T15:30:00Z"), episode_room_id: "r2" },
			{ ...airing("b", "2026-10-21T14:25:00Z", "2026-10-21T15:30:00Z"), episode_room_id: "r4" },
		];
		expect(openableEpisodeLimit({ anime: base, rooms: [r("r2", 2), r("r4", 4)], airings, now })).toBe(2);
	});

	it("放送枠の無い作品は、放送終了か配信開始済みの ONA / OVA なら話数まで", () => {
		const none = { rooms: [], airings: [], now };
		expect(openableEpisodeLimit({ anime: { ...base, status: "finished" }, ...none })).toBe(12);
		expect(openableEpisodeLimit({ anime: { ...base, type: "ONA" }, ...none })).toBe(12);
		expect(openableEpisodeLimit({ anime: { ...base, type: "ONA", aired_from: "2026-11-01" }, ...none })).toBe(0);
		expect(openableEpisodeLimit({ anime: base, ...none })).toBe(0);
		expect(openableEpisodeLimit({ anime: { ...base, status: "finished", episode_total: null }, ...none })).toBe(0);
	});
});
