import { describe, expect, it } from "vitest";
import type { BroadcastRoomOverride } from "$lib/types";
import { type BroadcastEpisodeLogSlot, buildBroadcastEpisodeLog } from "./broadcast-episode-log";

// broadcast_day/time を null にして今日基準の合成補完を切り、実在セッションの
// スナップショットだけで決定的にテストする。
const ANIME = {
	season: "2026-spring",
	room_type: "episode" as const,
	aired_from: "2026-04-10",
	aired_to: null,
	broadcast_day: null,
	broadcast_time: null,
};

function snapshot(
	date: string,
	start: number | null = null,
	opened = true,
	label: string | null = null,
): BroadcastEpisodeLogSlot {
	return { date, start, end: start, label, opened };
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

describe("buildBroadcastEpisodeLog", () => {
	it("numbers unnumbered past sessions backward from an unopened future anchor", () => {
		// 神の雫パターン: 過去の実在セッションは話数なし（同期前に開催）、
		// 番号付きセッションはローリング同期範囲の未来（未開場）にしかない。
		const log = buildBroadcastEpisodeLog(
			ANIME,
			[
				snapshot("2026-07-31"),
				snapshot("2026-08-07"),
				snapshot("2026-08-14"),
				snapshot("2026-08-21"),
				snapshot("2026-08-28", 5, false),
			],
			[],
		);
		expect(log.map((slot) => [slot.date, slot.start, slot.opened])).toEqual([
			["2026-07-31", 1, true],
			["2026-08-07", 2, true],
			["2026-08-14", 3, true],
			["2026-08-21", 4, true],
			["2026-08-28", 5, false],
		]);
	});

	it("applies recap overrides while numbering backward", () => {
		const overrides = [override({ room_date: "2026-08-07", episode_count_increment: 0, episode_label: "総集編" })];
		const log = buildBroadcastEpisodeLog(
			ANIME,
			[snapshot("2026-07-31"), snapshot("2026-08-07"), snapshot("2026-08-14"), snapshot("2026-08-21", 3, false)],
			overrides,
		);
		expect(log.map((slot) => [slot.date, slot.start, slot.label])).toEqual([
			["2026-07-31", 1, null],
			["2026-08-07", null, "総集編"],
			["2026-08-14", 2, null],
			["2026-08-21", 3, null],
		]);
	});
});
