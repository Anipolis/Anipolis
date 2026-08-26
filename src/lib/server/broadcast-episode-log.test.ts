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

	it("does not count unnumbered syobocal slots that carry their own subtitle (特番)", () => {
		// ヤニねこパターン: しょぼいが話数を付けず「特番」とだけ題した枠は
		// 通常話ではないので、逆算のカウントを消費しない。
		const log = buildBroadcastEpisodeLog(
			ANIME,
			[
				snapshot("2026-07-31"),
				snapshot("2026-08-07"),
				snapshot("2026-08-14", null, true, "特番"),
				snapshot("2026-08-21"),
				snapshot("2026-08-28", 4, false),
			],
			[],
		);
		expect(log.map((slot) => [slot.date, slot.start, slot.label])).toEqual([
			["2026-07-31", 1, null],
			["2026-08-07", 2, null],
			["2026-08-14", null, "特番"],
			["2026-08-21", 3, null],
			["2026-08-28", 4, null],
		]);
	});

	it("synthesizes gap dates on the anchor's weekday, not a stale broadcast_day", () => {
		// 骸骨騎士様Ⅱパターン: MAL由来 broadcast_day がAT-X先行の月曜のままでも、
		// しょぼいアンカー（木曜）の曜日で過去日を補完する。
		const anime = {
			...ANIME,
			aired_from: "2026-07-06",
			aired_to: "2026-08-06",
			broadcast_day: 1,
			broadcast_time: "22:00",
		};
		const log = buildBroadcastEpisodeLog(anime, [snapshot("2026-08-06", 5)], []);
		expect(log.map((slot) => [slot.date, slot.start])).toEqual([
			["2026-07-09", 1],
			["2026-07-16", 2],
			["2026-07-23", 3],
			["2026-07-30", 4],
			["2026-08-06", 5],
		]);
	});

	it("snaps a day-late MAL aired_from back to the late-night convention weekday", () => {
		// MALは24時超表記に対応せず、土曜25:30の初回を「日曜」の実日付で返すことが
		// ある。1日前から探索して土曜(慣習日)の週次パターンに吸着させる。
		const anime = {
			...ANIME,
			aired_from: "2026-07-05",
			aired_to: "2026-08-01",
			broadcast_day: 6,
			broadcast_time: "25:30",
		};
		const log = buildBroadcastEpisodeLog(anime, [snapshot("2026-08-01", 5)], []);
		expect(log.map((slot) => [slot.date, slot.start])).toEqual([
			["2026-07-04", 1],
			["2026-07-11", 2],
			["2026-07-18", 3],
			["2026-07-25", 4],
			["2026-08-01", 5],
		]);
	});

	it("drops cancelled dates even when a stale session row still exists", () => {
		// 放送休止オーバーライドより前に（旧フォールバック等で）セッション行が
		// 作られていた場合でも、ログから除外され番号カウントも消費しない。
		const overrides = [override({ room_date: "2026-08-07", is_cancelled: true })];
		const log = buildBroadcastEpisodeLog(
			ANIME,
			[snapshot("2026-07-31"), snapshot("2026-08-07"), snapshot("2026-08-14"), snapshot("2026-08-21", 3, false)],
			overrides,
		);
		expect(log.map((slot) => [slot.date, slot.start])).toEqual([
			["2026-07-31", 1],
			["2026-08-14", 2],
			["2026-08-21", 3],
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
