import { describe, expect, it } from "vitest";
import type { Anime } from "$lib/types";
import { countMylistByStatus, groupMylistByStatus, parseMylistSort, parseMylistTab, sortMylist } from "./sort";

function anime(
	id: string,
	entry: { score?: number | null; updated_at: string; created_at?: string },
	aired: { aired_from?: string | null; season?: string | null } = {},
): Anime {
	return {
		id,
		title: id,
		aired_from: aired.aired_from ?? null,
		season: aired.season ?? null,
		user_entry: { status: "watching", progress: 0, score: entry.score ?? null, ...entry },
	} as Anime;
}

const ids = (list: Anime[]) => list.map((a) => a.id);

describe("parseMylistTab", () => {
	it("知らない値や指定なしは「すべて」にする", () => {
		expect(parseMylistTab(null)).toBe("all");
		expect(parseMylistTab("unknown")).toBe("all");
		expect(parseMylistTab("completed")).toBe("completed");
	});
});

describe("groupMylistByStatus", () => {
	const withStatus = (id: string, status: string) => ({ id, user_entry: { status } }) as unknown as Anime;

	it("「すべて」は並べ替え済みの順のまま、ステータスをまたいで並べる", () => {
		const grouped = groupMylistByStatus([
			withStatus("a", "completed"),
			withStatus("b", "watching"),
			withStatus("c", "completed"),
		]);
		expect(ids(grouped.all)).toEqual(["a", "b", "c"]);
		expect(ids(grouped.completed)).toEqual(["a", "c"]);
	});

	it("知らないステータスの行はどのタブにも入れず、「すべて」の件数は各タブの合計とそろう", () => {
		const counts = countMylistByStatus(
			groupMylistByStatus([withStatus("a", "watching"), withStatus("b", "unknown"), withStatus("c", "all")]),
		);
		expect(counts.all).toBe(1);
		expect(counts.watching).toBe(1);
	});
});

describe("parseMylistSort", () => {
	it("知らない値や空は更新が新しい順にする", () => {
		expect(parseMylistSort("score_desc")).toBe("score_desc");
		expect(parseMylistSort("nope")).toBe("updated");
		expect(parseMylistSort(null)).toBe("updated");
	});
});

describe("sortMylist", () => {
	const a = anime(
		"a",
		{ score: 7, updated_at: "2026-11-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
		{ season: "2024-fall" },
	);
	const b = anime(
		"b",
		{ score: 9, updated_at: "2026-10-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" },
		{ aired_from: "2026-04-05" },
	);
	const c = anime("c", { score: null, updated_at: "2026-11-02T00:00:00Z", created_at: "2026-02-01T00:00:00Z" });

	it("更新が新しい順", () => {
		expect(ids(sortMylist([a, b, c], "updated"))).toEqual(["c", "a", "b"]);
	});

	it("登録が新しい順・古い順", () => {
		expect(ids(sortMylist([a, b, c], "created_desc"))).toEqual(["b", "c", "a"]);
		expect(ids(sortMylist([a, b, c], "created_asc"))).toEqual(["a", "c", "b"]);
	});

	it("スコアの無い作品はどちらの向きでも最後", () => {
		expect(ids(sortMylist([a, b, c], "score_desc"))).toEqual(["b", "a", "c"]);
		expect(ids(sortMylist([a, b, c], "score_asc"))).toEqual(["a", "b", "c"]);
	});

	it("放送時期は放送開始日、無ければ季節で比べ、分からない作品は最後", () => {
		expect(ids(sortMylist([a, b, c], "aired_desc"))).toEqual(["b", "a", "c"]);
		expect(ids(sortMylist([a, b, c], "aired_asc"))).toEqual(["a", "b", "c"]);
	});

	it("同じ値どうしは更新が新しい順", () => {
		const d = anime("d", { score: 7, updated_at: "2026-11-03T00:00:00Z" });
		expect(ids(sortMylist([a, d], "score_desc"))).toEqual(["d", "a"]);
	});

	it("元の配列は変えない", () => {
		const list = [a, b, c];
		sortMylist(list, "score_desc");
		expect(ids(list)).toEqual(["a", "b", "c"]);
	});
});
