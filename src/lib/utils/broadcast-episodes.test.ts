import { describe, expect, it } from "vitest";
import type { BroadcastRoomOverride } from "$lib/types";
import { type BroadcastEpisodeSlot, inferEpisodeNumbersBackward } from "./broadcast-episodes";

function slot(date: string, start: number | null = null, label: string | null = null): BroadcastEpisodeSlot {
	return { date, start, end: start, label };
}

function override(partial: Partial<BroadcastRoomOverride> & { room_date: string }): BroadcastRoomOverride {
	return {
		anime_id: 1,
		is_cancelled: false,
		broadcast_time: null,
		duration_minutes: null,
		pre_open_minutes: null,
		post_close_minutes: null,
		episode_start: null,
		episode_end: null,
		episode_label: null,
		episode_count_increment: null,
		announcement_label: null,
		note: null,
		...partial,
	} as BroadcastRoomOverride;
}

describe("inferEpisodeNumbersBackward", () => {
	it("numbers pre-sync dates backward from the Syobocal anchor", () => {
		const slots = [slot("2026-07-07"), slot("2026-07-14"), slot("2026-07-21"), slot("2026-08-25", 8)];
		// 途中3週分は掲載していない想定（合成が全週返す実運用では連続になる）
		const mismatch = inferEpisodeNumbersBackward(slots, new Map());
		expect(slots.map((s) => s.start)).toEqual([5, 6, 7, 8]);
		// 最古が第1話にならない → leftoverとして検出される
		expect(mismatch).toEqual({ kind: "leftover", firstNumber: 5 });
	});

	it("reaches episode 1 cleanly for a continuous weekly run", () => {
		const slots = [
			slot("2026-07-07"),
			slot("2026-07-14"),
			slot("2026-07-21"),
			slot("2026-07-28"),
			slot("2026-08-04"),
			slot("2026-08-11"),
			slot("2026-08-18"),
			slot("2026-08-25", 8),
		];
		expect(inferEpisodeNumbersBackward(slots, new Map())).toBeNull();
		expect(slots.map((s) => s.start)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it("respects recap overrides (no number, no count) and explicit episode ranges", () => {
		const overrides = new Map<string, BroadcastRoomOverride>([
			["2026-07-21", override({ room_date: "2026-07-21", episode_count_increment: 0, episode_label: "総集編" })],
			["2026-07-14", override({ room_date: "2026-07-14", episode_start: 2, episode_end: 3 })],
		]);
		const slots = [
			slot("2026-07-07"),
			slot("2026-07-14"),
			slot("2026-07-21", null, "総集編"),
			slot("2026-07-28"),
			slot("2026-08-04", 5),
		];
		expect(inferEpisodeNumbersBackward(slots, overrides)).toBeNull();
		expect(slots.map((s) => [s.start, s.end])).toEqual([
			[1, 1],
			[2, 3],
			[null, null],
			[4, 4],
			[5, 5],
		]);
	});

	it("flags underflow when there are more dates than episodes", () => {
		const slots = [slot("2026-07-07"), slot("2026-07-14"), slot("2026-07-21"), slot("2026-07-28", 2)];
		const mismatch = inferEpisodeNumbersBackward(slots, new Map());
		expect(mismatch).toEqual({ kind: "underflow", date: "2026-07-14" });
		expect(slots.map((s) => s.start)).toEqual([null, null, 1, 2]);
	});
});
