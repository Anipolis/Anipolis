import { describe, expect, it } from "vitest";
import { minutesUntilBroadcast } from "./broadcast-room";
import { eventBroadcastDateKey } from "./event-time";
import {
	addDaysToDateKey,
	dateKeyWeekday,
	formatDateKeyShort,
	isDateKey,
	jstBroadcastDateKey,
	jstDateKey,
	jstWallClockToDate,
	jstWeekRange,
	startOfWeekDateKey,
} from "./jst";

// 期待値はすべて固定の UTC 瞬間から導く。マシンの TZ（UTC / Asia/Tokyo どちらでも）に
// 依存しないことを、このファイルを TZ を変えて実行して確認する。

describe("jstDateKey / jstBroadcastDateKey", () => {
	it("crosses the JST midnight boundary independently of the server timezone", () => {
		// 2026-09-28T15:30Z = 09-29 00:30 JST（月曜→火曜へ日付が変わった直後）
		expect(jstDateKey("2026-09-28T15:30:00Z")).toBe("2026-09-29");
		// 2026-09-28T14:59:59Z = 09-28 23:59:59 JST
		expect(jstDateKey("2026-09-28T14:59:59Z")).toBe("2026-09-28");
		// 2026-09-28T15:00:00Z = 09-29 00:00:00 JST ちょうど
		expect(jstDateKey("2026-09-28T15:00:00Z")).toBe("2026-09-29");
		// Date / epoch ms も受け付ける
		expect(jstDateKey(new Date("2026-09-28T15:30:00Z"))).toBe("2026-09-29");
		expect(jstDateKey(Date.parse("2026-09-28T15:30:00Z"))).toBe("2026-09-29");
	});

	it("assigns JST 00:00-03:59 to the previous broadcast date (4am boundary)", () => {
		// 09-29 00:30 JST → 放送日は 09-28
		expect(jstBroadcastDateKey("2026-09-28T15:30:00Z")).toBe("2026-09-28");
		// 09-29 03:59:59 JST → 09-28
		expect(jstBroadcastDateKey("2026-09-28T18:59:59Z")).toBe("2026-09-28");
		// 09-29 04:00:00 JST → 09-29
		expect(jstBroadcastDateKey("2026-09-28T19:00:00Z")).toBe("2026-09-29");
		// 09-28 23:59:59 JST → 09-28
		expect(jstBroadcastDateKey("2026-09-28T14:59:59Z")).toBe("2026-09-28");
	});
});

describe("isDateKey / dateKeyWeekday", () => {
	it("validates YYYY-MM-DD as a real calendar date without touching local time", () => {
		expect(isDateKey("2026-09-28")).toBe(true);
		expect(isDateKey("2024-02-29")).toBe(true);
		expect(isDateKey("2026-02-29")).toBe(false);
		expect(isDateKey("2026-13-01")).toBe(false);
		expect(isDateKey("2026-9-28")).toBe(false);
		expect(isDateKey("2026-09-28T00:00:00")).toBe(false);
		expect(isDateKey("")).toBe(false);
		expect(isDateKey(null)).toBe(false);
		expect(isDateKey(undefined)).toBe(false);
	});

	it("returns the weekday of a date key (0=Sun)", () => {
		expect(dateKeyWeekday("2026-09-27")).toBe(0); // 日
		expect(dateKeyWeekday("2026-09-28")).toBe(1); // 月
		expect(dateKeyWeekday("2026-10-03")).toBe(6); // 土
		expect(dateKeyWeekday("2026-01-01")).toBe(4); // 木
		expect(dateKeyWeekday("bad")).toBeNull();
	});
});

describe("addDaysToDateKey / startOfWeekDateKey", () => {
	it("adds days across month and year boundaries", () => {
		expect(addDaysToDateKey("2026-09-28", 3)).toBe("2026-10-01");
		expect(addDaysToDateKey("2026-10-01", -1)).toBe("2026-09-30");
		expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDaysToDateKey("2027-01-01", -7)).toBe("2026-12-25");
		expect(addDaysToDateKey("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDaysToDateKey("2026-09-28", 0)).toBe("2026-09-28");
		expect(() => addDaysToDateKey("2026-02-30", 1)).toThrow(RangeError);
	});

	it("snaps any date key to the Sunday that starts its week", () => {
		expect(startOfWeekDateKey("2026-09-27")).toBe("2026-09-27"); // 日曜はそのまま
		expect(startOfWeekDateKey("2026-09-28")).toBe("2026-09-27");
		expect(startOfWeekDateKey("2026-10-03")).toBe("2026-09-27"); // 土曜
		// 月跨ぎ・年跨ぎ
		expect(startOfWeekDateKey("2026-10-01")).toBe("2026-09-27");
		expect(startOfWeekDateKey("2027-01-01")).toBe("2026-12-27");
		expect(startOfWeekDateKey("2026-01-02")).toBe("2025-12-28");
	});

	it("keeps 'this week' on the previous week until JST Sunday 04:00", () => {
		// 2026-10-04 は日曜。10-03T15:30Z = 10-04 00:30 JST → 放送日は土曜 10-03 → 前週
		const lateSaturday = jstBroadcastDateKey("2026-10-03T15:30:00Z");
		expect(lateSaturday).toBe("2026-10-03");
		expect(startOfWeekDateKey(lateSaturday)).toBe("2026-09-27");
		// 10-03T19:00Z = 10-04 04:00 JST → 放送日は日曜 10-04 → 新しい週
		const sundayMorning = jstBroadcastDateKey("2026-10-03T19:00:00Z");
		expect(sundayMorning).toBe("2026-10-04");
		expect(startOfWeekDateKey(sundayMorning)).toBe("2026-10-04");
		// 10-04T14:59:59Z = 10-04 23:59:59 JST（UTC ではまだ日曜の昼）→ 新しい週
		expect(startOfWeekDateKey(jstBroadcastDateKey("2026-10-04T14:59:59Z"))).toBe("2026-10-04");
	});
});

describe("jstWallClockToDate", () => {
	it("converts a JST wall clock time (incl. 24h+ late-night notation) to an instant", () => {
		expect(jstWallClockToDate("2026-09-28", 0)?.toISOString()).toBe("2026-09-27T15:00:00.000Z");
		expect(jstWallClockToDate("2026-09-28", 20, 0)?.toISOString()).toBe("2026-09-28T11:00:00.000Z");
		// 25:30 = 翌日 01:30 JST
		expect(jstWallClockToDate("2026-09-28", 25, 30)?.toISOString()).toBe("2026-09-28T16:30:00.000Z");
		expect(jstWallClockToDate("2026-02-30", 0)).toBeNull();
	});
});

describe("jstWeekRange", () => {
	it("returns Sunday..Saturday date keys and the matching broadcast-date instant range", () => {
		const week = jstWeekRange("2026-09-30"); // 水曜を渡しても日曜に丸める
		expect(week.start).toBe("2026-09-27");
		expect(week.end).toBe("2026-10-03");
		// 日曜 04:00 JST = 土曜 19:00 UTC
		expect(week.startsAt.toISOString()).toBe("2026-09-26T19:00:00.000Z");
		// 翌日曜 04:00 JST（開区間）
		expect(week.endsAt.toISOString()).toBe("2026-10-03T19:00:00.000Z");
	});

	it("keeps the event range and the room_date range on the same week", () => {
		const week = jstWeekRange("2026-12-27"); // 年跨ぎの週
		expect(week.end).toBe("2027-01-02");
		// 範囲の先頭の瞬間は週の初日、末尾（endsAt - 1ms）は週の最終日にマップされる
		expect(eventBroadcastDateKey(week.startsAt.toISOString())).toBe(week.start);
		expect(eventBroadcastDateKey(new Date(week.endsAt.getTime() - 1).toISOString())).toBe(week.end);
		// 範囲の直前・直後の瞬間は前週の土曜・翌週の日曜になる
		expect(eventBroadcastDateKey(new Date(week.startsAt.getTime() - 1).toISOString())).toBe("2026-12-26");
		expect(eventBroadcastDateKey(week.endsAt.toISOString())).toBe("2027-01-03");
		// 7 日ぶんの日付キーがすべて範囲内
		for (let i = 0; i < 7; i++) {
			const key = addDaysToDateKey(week.start, i);
			expect(key >= week.start && key <= week.end).toBe(true);
		}
		expect(addDaysToDateKey(week.start, 7) > week.end).toBe(true);
	});
});

describe("minutesUntilBroadcast (JST wall clock)", () => {
	const anime = {
		id: "1",
		broadcast_time: "25:30",
		broadcast_day: 1,
	} as unknown as import("$lib/types").Anime;

	it("interprets broadcast_time as JST regardless of the runtime timezone", () => {
		// 月曜 25:30 = 火曜 01:30 JST = 月曜 16:30 UTC
		expect(minutesUntilBroadcast(anime, new Date("2026-09-28T16:00:00Z"), "2026-09-28", undefined)).toBe(30);
		expect(minutesUntilBroadcast(anime, new Date("2026-09-28T16:30:00Z"), "2026-09-28", undefined)).toBe(0);
		expect(minutesUntilBroadcast(anime, new Date("2026-09-28T17:00:00Z"), "2026-09-28", undefined)).toBe(-30);
	});
});

describe("formatDateKeyShort", () => {
	it("formats a date key as M/D without constructing a Date", () => {
		expect(formatDateKeyShort("2026-09-28")).toBe("9/28");
		expect(formatDateKeyShort("2026-10-03")).toBe("10/3");
		expect(formatDateKeyShort("garbage")).toBe("garbage");
	});
});
