import { describe, expect, it } from "vitest";
import { planStatusUpdates } from "./anime-catalog-status-updates";

describe("planStatusUpdates（#594）", () => {
	it("既にある行で status が変わるものだけを、新しい status ごとにまとめる", () => {
		const plan = planStatusUpdates(
			[
				{ mal_id: 1, status: "finished" },
				{ mal_id: 2, status: "finished" },
				{ mal_id: 3, status: "airing" },
				{ mal_id: 4, status: "finished" },
			],
			new Map([
				[1, "upcoming"],
				[2, "airing"],
				[3, "airing"],
				[4, "finished"],
			]),
		);
		expect([...plan.byStatus]).toEqual([["finished", [1, 2]]]);
		expect([...plan.transitions]).toEqual([
			["upcoming → finished", 1],
			["airing → finished", 1],
		]);
		expect(plan.skippedMissing).toBe(0);
	});

	it("カタログにまだ無い作品は追加しない（数だけ返す）", () => {
		const plan = planStatusUpdates([{ mal_id: 9, status: "finished" }], new Map());
		expect(plan.byStatus.size).toBe(0);
		expect(plan.skippedMissing).toBe(1);
	});

	it("決められなかった status（null）で今の値を消さない。今の値が空なら埋める", () => {
		const plan = planStatusUpdates(
			[
				{ mal_id: 1, status: null },
				{ mal_id: 2, status: "airing" },
			],
			new Map<number, string | null>([
				[1, "airing"],
				[2, null],
			]),
		);
		expect([...plan.byStatus]).toEqual([["airing", [2]]]);
		expect([...plan.transitions]).toEqual([["(空) → airing", 1]]);
	});
});
