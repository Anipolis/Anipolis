import { describe, expect, it } from "vitest";
import { formatPostClock, formatPostDateTime, formatPostTime } from "./format";

describe("投稿の時刻（JST）", () => {
	const now = new Date("2026-10-21T15:00:00Z"); // JST 10/22 00:00
	it("今日は時刻だけ、今年は月日つき、それより前は年月日", () => {
		expect(formatPostTime("2026-10-21T15:03:00Z", now)).toBe("00:03");
		expect(formatPostTime("2026-10-21T12:03:00Z", now)).toBe("10/21 21:03");
		expect(formatPostTime("2025-12-31T14:59:00Z", now)).toBe("2025/12/31");
	});
	it("時刻だけ・秒までの日時も JST で出す", () => {
		expect(formatPostClock("2026-10-21T12:03:59Z")).toBe("21:03");
		expect(formatPostDateTime("2026-10-21T12:03:05Z")).toBe("2026/10/21 21:03:05");
	});
});
