import { describe, expect, it } from "vitest";
import {
	type AuditAnime,
	findMappingIssues,
	mappingIssueKey,
	newerTidCandidates,
	parseTitleSearch,
	titleSearchBase,
} from "./syobocal-mapping-audit";

const anime = (overrides: Partial<AuditAnime> & { id: number }): AuditAnime => ({
	mal_id: overrides.id * 10,
	title: `作品${overrides.id}`,
	type: "TV",
	aired_from: "2026-10-05",
	episode_total: 12,
	room_type: "episode",
	...overrides,
});

const run = (
	list: AuditAnime[],
	tids: [number, number[]][],
	sessions: [number, { first: number; rerun: number }][],
	today = "2026-11-18",
) => findMappingIssues({ anime: list, tidsByMalId: new Map(tids), sessionsByAnimeId: new Map(sessions), today });

describe("findMappingIssues（#593）", () => {
	it("本放送の枠が無く再放送だけなら rerun_only（分割2クールで1クール目の TID のまま）", () => {
		const issues = run([anime({ id: 1 })], [[10, [7783]]], [[1, { first: 0, rerun: 6 }]]);
		expect(issues.map((issue) => issue.kind)).toEqual(["rerun_only"]);
		expect(issues[0]?.tids).toEqual([7783]);
	});

	it("TID があるのに放送開始から3日たっても枠が無ければ no_sessions。始まった直後は待つ", () => {
		expect(run([anime({ id: 1, aired_from: "2026-11-10" })], [[10, [1]]], []).map((i) => i.kind)).toEqual([
			"no_sessions",
		]);
		expect(run([anime({ id: 1, aired_from: "2026-11-17" })], [[10, [1]]], [])).toEqual([]);
	});

	it("本放送の枠があれば問題なし。まだ始まっていない作品・TV 以外・作品ルームだけの作品は見ない", () => {
		expect(run([anime({ id: 1 })], [[10, [1]]], [[1, { first: 5, rerun: 2 }]])).toEqual([]);
		expect(run([anime({ id: 2, aired_from: "2026-12-01" })], [[20, [1]]], [])).toEqual([]);
		expect(run([anime({ id: 3, type: "Movie" })], [[30, [1]]], [])).toEqual([]);
		expect(run([anime({ id: 4, room_type: "global" })], [[40, [1]]], [])).toEqual([]);
	});

	it("TID の対応が無い作品は、枠の点検をしない（しょぼいに無い作品もあるため）", () => {
		expect(run([anime({ id: 1 })], [], [])).toEqual([]);
	});

	it("話数が空で放送中なら missing_episode_total（#597 の手入力の候補）", () => {
		const issues = run([anime({ id: 1, episode_total: null })], [[10, [1]]], [[1, { first: 3, rerun: 0 }]]);
		expect(issues.map((issue) => issue.kind)).toEqual(["missing_episode_total"]);
		expect(mappingIssueKey(issues[0] ?? { kind: "rerun_only", animeId: 0 })).toBe("missing_episode_total:1");
	});
});

describe("titleSearchBase", () => {
	it("続編の印とサブタイトルを落として、1クール目と共通の頭にする", () => {
		expect(titleSearchBase("夜桜さんちの大作戦 第2期 2クール")).toBe("夜桜さんちの大作戦");
		expect(titleSearchBase("ルルットリリィ 第2クール")).toBe("ルルットリリィ");
		expect(titleSearchBase("ダイヤのA actII 第2クール")).toBe("ダイヤのA actII");
		expect(titleSearchBase("千歳くんはラムネ瓶のなか 第2クール")).toBe("千歳くんはラムネ瓶のなか");
		expect(titleSearchBase("アオアシ Season2")).toBe("アオアシ");
		expect(titleSearchBase("PSYREN -サイレン-")).toBe("PSYREN");
	});

	it("落とすと短くなりすぎるときは元の題名を使う", () => {
		expect(titleSearchBase("A 第2期")).toBe("A 第2期");
	});
});

describe("TitleSearch の候補", () => {
	const json = {
		Titles: {
			"7786": { TID: "7786", Title: "魔法の姉妹ルルットリリィ", FirstYear: "2026", FirstMonth: "4" },
			"8002": { TID: "8002", Title: "魔法の姉妹ルルットリリィ(第2クール)", FirstYear: "2026", FirstMonth: "10" },
			"9000": { TID: "9000", Title: "別の作品", FirstYear: "2026", FirstMonth: "10" },
			bad: { TID: "x", Title: "" },
		},
	};

	it("形の正しい行だけを読む", () => {
		expect(parseTitleSearch(json).map((hit) => hit.tid)).toEqual([7786, 8002, 9000]);
		expect(parseTitleSearch(null)).toEqual([]);
		expect(parseTitleSearch({ Titles: "nope" })).toEqual([]);
	});

	it("今の TID より新しく、題名に検索語を含むものだけを新しい順に返す（頭に語が付いていても拾う）", () => {
		expect(newerTidCandidates(parseTitleSearch(json), "ルルットリリィ", [7786]).map((hit) => hit.tid)).toEqual([
			8002,
		]);
		expect(newerTidCandidates(parseTitleSearch(json), "ルルットリリィ", [8002])).toEqual([]);
	});
});
