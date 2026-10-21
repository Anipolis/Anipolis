import { describe, expect, it } from "vitest";
import { formatPostClock, formatPostDateTime, formatPostDay } from "./format";

describe("投稿の日付・時刻（JST）", () => {
	const now = new Date("2026-10-21T15:30:00Z"); // JST 10/22 00:30
	it("日付は今日・昨日・今年は月日・それより前は年月日", () => {
		expect(formatPostDay("2026-10-21T15:03:00Z", now)).toBe("今日");
		expect(formatPostDay("2026-10-21T12:03:00Z", now)).toBe("昨日");
		expect(formatPostDay("2026-10-20T14:59:00Z", now)).toBe("10/20");
		expect(formatPostDay("2025-12-31T14:59:00Z", now)).toBe("2025/12/31");
	});
	it("時刻だけ・秒までの日時も JST で出す", () => {
		expect(formatPostClock("2026-10-21T12:03:59Z")).toBe("21:03");
		expect(formatPostDateTime("2026-10-21T12:03:05Z")).toBe("2026/10/21 21:03:05");
	});
});
