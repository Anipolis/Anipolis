import { describe, expect, it } from "vitest";
import { type AnimeCandidate, rankAnimeCandidateIds } from "./queries";

// created_at DESC 済みで DB から来る前提（配列インデックス = 新着順）
const candidates: AnimeCandidate[] = [
	{ id: 1, created_at: "2026-01-05T00:00:00Z", genre: ["アクション"], genre_en: ["Action"] },
	{ id: 2, created_at: "2026-01-04T00:00:00Z", genre: ["コメディ"], genre_en: ["Comedy"] },
	{ id: 3, created_at: "2026-01-03T00:00:00Z", genre: ["アクション", "コメディ"], genre_en: null },
	{ id: 4, created_at: "2026-01-02T00:00:00Z", genre: null, genre_en: null },
];

describe("rankAnimeCandidateIds", () => {
	it("created 順は新着（配列順）を保つ", () => {
		expect(rankAnimeCandidateIds(candidates, new Map(), "created", [])).toEqual(["1", "2", "3", "4"]);
	});

	it("popular 順はメトリクス降順、欠損は0扱いで新着タイブレーク", () => {
		const metrics = new Map([
			["1", { primary: 5, secondary: 0 }],
			["3", { primary: 20, secondary: 0 }],
			["2", { primary: 20, secondary: 0 }],
			// id 4 はメトリクスなし → 0
		]);
		// primary: 3,2 が20で同率 → 新着順(2が先) → 次に1(5) → 最後に4(0)
		expect(rankAnimeCandidateIds(candidates, metrics, "popular", [])).toEqual(["2", "3", "1", "4"]);
	});

	it("top_rated は primary 同率のとき secondary（件数）で決める", () => {
		const metrics = new Map([
			["1", { primary: 8, secondary: 3 }],
			["2", { primary: 8, secondary: 50 }],
			["3", { primary: 9, secondary: 1 }],
			["4", { primary: 1, secondary: 999 }],
		]);
		// primary: 3(9) → 1と2は8で同率 → secondary降順(2=50 > 1=3) → 4(1)
		expect(rankAnimeCandidateIds(candidates, metrics, "top_rated", [])).toEqual(["3", "2", "1", "4"]);
	});

	it("ジャンル選択時は一致数がメトリクス同率のタイブレークになる", () => {
		const metrics = new Map([
			["1", { primary: 10, secondary: 0 }],
			["2", { primary: 10, secondary: 0 }],
			["3", { primary: 10, secondary: 0 }],
			["4", { primary: 10, secondary: 0 }],
		]);
		// 全員 primary 10 同率。「アクション」「コメディ」両方選択 → id3 が2一致で最上位、
		// id1(アクション)・id2(コメディ)が1一致 → 新着順(1が先)、id4は0一致で最後
		expect(rankAnimeCandidateIds(candidates, metrics, "popular", ["アクション", "コメディ"])).toEqual([
			"3",
			"1",
			"2",
			"4",
		]);
	});

	it("created 順 + ジャンル選択はジャンル一致優先、その中で新着順", () => {
		// id3(2一致) → id1,id2(1一致, 新着順) → id4(0)
		expect(rankAnimeCandidateIds(candidates, new Map(), "created", ["アクション", "コメディ"])).toEqual([
			"3",
			"1",
			"2",
			"4",
		]);
	});
});
