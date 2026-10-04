import { describe, expect, it } from "vitest";
import {
	type AnimeCandidate,
	moveBroadcastDayFirst,
	rankAnimeCandidateIds,
	seasonSortKey,
	sortIdsByNewestSeason,
} from "./queries";

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

describe("moveBroadcastDayFirst", () => {
	const dayCandidates: AnimeCandidate[] = [
		{ id: 1, created_at: "2026-01-05T00:00:00Z", genre: null, genre_en: null, broadcast_day: 2 },
		{ id: 2, created_at: "2026-01-04T00:00:00Z", genre: null, genre_en: null, broadcast_day: 6 },
		{ id: 3, created_at: "2026-01-03T00:00:00Z", genre: null, genre_en: null, broadcast_day: null },
		{ id: 4, created_at: "2026-01-02T00:00:00Z", genre: null, genre_en: null, broadcast_day: 6 },
	];

	it("指定曜日の作品を相対順を保ったまま先頭へ寄せる", () => {
		expect(moveBroadcastDayFirst(["1", "2", "3", "4"], dayCandidates, 6)).toEqual(["2", "4", "1", "3"]);
	});

	it("該当作品が無ければ並びを変えない", () => {
		expect(moveBroadcastDayFirst(["4", "3", "2", "1"], dayCandidates, 0)).toEqual(["4", "3", "2", "1"]);
	});
});

describe("seasonSortKey / sortIdsByNewestSeason", () => {
	it("YYYY-季節 を新旧比較できる数値にする", () => {
		expect(seasonSortKey("2026-fall")).toBeGreaterThan(seasonSortKey("2026-summer") ?? 0);
		expect(seasonSortKey("2026-winter")).toBeGreaterThan(seasonSortKey("2025-fall") ?? 0);
	});

	it("形式どおりでない値は null（年だけ一致しても冬扱いにしない）", () => {
		expect(seasonSortKey("2026-不明")).toBeNull();
		expect(seasonSortKey("2026")).toBeNull();
		expect(seasonSortKey("2026-fall-extra")).toBeNull();
		expect(seasonSortKey(null)).toBeNull();
	});

	it("新しいシーズン順に並べ、同シーズン内の順とシーズン不明（最後）を保つ", () => {
		const seasonCandidates: AnimeCandidate[] = [
			{ id: 1, created_at: "", genre: null, genre_en: null, season: "1969-fall" },
			{ id: 2, created_at: "", genre: null, genre_en: null, season: "2026-fall" },
			{ id: 3, created_at: "", genre: null, genre_en: null, season: null },
			{ id: 4, created_at: "", genre: null, genre_en: null, season: "2026-spring" },
			{ id: 5, created_at: "", genre: null, genre_en: null, season: "2026-fall" },
		];
		expect(sortIdsByNewestSeason(["5", "1", "3", "2", "4"], seasonCandidates)).toEqual(["5", "2", "4", "1", "3"]);
	});
});
