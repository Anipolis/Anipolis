import { describe, expect, it } from "vitest";
import {
	compareTimelineDesc,
	parseTimelineCursor,
	timelineCursorFilter,
	timelineCursorHref,
	timestampMicros,
} from "./timeline-cursor";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const AT = "2026-10-21T05:35:53.123456+00:00";

describe("parseTimelineCursor（#243 / #250）", () => {
	it("before と before_id がそろって正しい形なら目印にする", () => {
		expect(parseTimelineCursor(new URLSearchParams({ before: AT, before_id: ID }))).toEqual({
			createdAt: AT,
			id: ID,
		});
		expect(parseTimelineCursor(new URLSearchParams({ before: "2026-10-21T05:35:53Z", before_id: ID }))).toEqual({
			createdAt: "2026-10-21T05:35:53Z",
			id: ID,
		});
	});

	it("どちらかが無ければ先頭のページ", () => {
		expect(parseTimelineCursor(new URLSearchParams({ before: AT }))).toBeUndefined();
		expect(parseTimelineCursor(new URLSearchParams({ before_id: ID }))).toBeUndefined();
		expect(parseTimelineCursor(new URLSearchParams())).toBeUndefined();
	});

	it("PostgREST のフィルタを書き換えうる値は受け付けない", () => {
		expect(parseTimelineCursor(new URLSearchParams({ before: AT, before_id: `${ID}),id.gt.0` }))).toBeUndefined();
		expect(parseTimelineCursor(new URLSearchParams({ before: `${AT},id.gt.0`, before_id: ID }))).toBeUndefined();
		expect(parseTimelineCursor(new URLSearchParams({ before: "2026-10-21", before_id: ID }))).toBeUndefined();
		expect(parseTimelineCursor(new URLSearchParams({ before: AT, before_id: "post-01" }))).toBeUndefined();
	});
});

describe("timelineCursorHref", () => {
	it("今のクエリ（tab）を残し、目印だけを差し替える。+ は %2B に書き出す", () => {
		const url = new URL(`https://anipolis.net/profile/alice?tab=images&before=old&before_id=old`);
		const href = timelineCursorHref(url, { createdAt: AT, id: ID });
		expect(href).toBe(`/profile/alice?tab=images&before=2026-10-21T05%3A35%3A53.123456%2B00%3A00&before_id=${ID}`);
		const parsed = new URL(href, url);
		expect(parseTimelineCursor(parsed.searchParams)).toEqual({ createdAt: AT, id: ID });
	});
});

describe("timestampMicros / compareTimelineDesc", () => {
	it("同じミリ秒の中もマイクロ秒で並べる（Date ではミリ秒までしか比べられない）", () => {
		expect(timestampMicros("2026-10-21T05:35:53.123457+00:00")).toBeGreaterThan(
			timestampMicros("2026-10-21T05:35:53.123456+00:00"),
		);
		expect(timestampMicros("2026-10-21T05:35:53.12+00:00")).toBe(timestampMicros("2026-10-21T05:35:53.120000Z"));
		expect(timestampMicros("2026-10-21T14:35:53+09:00")).toBe(timestampMicros("2026-10-21T05:35:53Z"));
	});

	it("新しい順、同じ時刻なら ID の降順（DB の order と同じ）", () => {
		const rows = [
			{ createdAt: "2026-10-21T05:00:00.000001Z", id: "a" },
			{ createdAt: "2026-10-21T05:00:00.000002Z", id: "a" },
			{ createdAt: "2026-10-21T05:00:00.000001Z", id: "b" },
		];
		expect(rows.sort(compareTimelineDesc).map((row) => `${row.createdAt.slice(-3)}:${row.id}`)).toEqual([
			"02Z:a",
			"01Z:b",
			"01Z:a",
		]);
	});
});

describe("timelineCursorFilter", () => {
	it("目印より古い行、同じ時刻なら ID が小さい行", () => {
		expect(timelineCursorFilter({ createdAt: AT, id: ID }, "post_id")).toBe(
			`created_at.lt.${AT},and(created_at.eq.${AT},post_id.lt.${ID})`,
		);
	});
});
