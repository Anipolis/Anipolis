import { describe, expect, it } from "vitest";
import { orderByTier, parseCollectionInput, withAnimeAdded, withAnimeRemoved } from "./collections";

function form(values: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
}

describe("コレクションの入力", () => {
	it("題名の前後の空白を落とし、空の説明は null にする", () => {
		expect(
			parseCollectionInput(form({ title: "  実況が盛り上がる作品 ", description: "  ", is_public: "on" })),
		).toEqual({
			ok: true,
			value: {
				title: "実況が盛り上がる作品",
				description: null,
				isPublic: true,
				kind: "list",
				tiers: null,
				tierOrigins: null,
			},
		});
	});

	it("公開のチェックが無ければ非公開", () => {
		const result = parseCollectionInput(form({ title: "自分用" }));
		expect(result.ok && result.value.isPublic).toBe(false);
	});

	it.each([
		[{ title: "   " }, "title"],
		[{ title: "あ".repeat(51) }, "title"],
		[{ title: "ok", description: "あ".repeat(301) }, "description"],
	])("%o は %s の誤り", (values, field) => {
		const result = parseCollectionInput(form(values));
		expect(result.ok).toBe(false);
		expect(!result.ok && result.field).toBe(field);
	});

	it("50文字の題名と300文字の説明は通す", () => {
		expect(parseCollectionInput(form({ title: "あ".repeat(50), description: "い".repeat(300) })).ok).toBe(true);
	});
});

describe("コレクションへの作品の出し入れ", () => {
	it("足すときは末尾に足し、入っていればそのまま", () => {
		expect(withAnimeAdded([3, 1], 2)).toEqual([3, 1, 2]);
		expect(withAnimeAdded([3, 1], 1)).toEqual([3, 1]);
	});

	it("外すときは並びを保ったまま抜き、入っていなければそのまま", () => {
		expect(withAnimeRemoved([3, 1, 2], 1)).toEqual([3, 2]);
		expect(withAnimeRemoved([3, 2], 1)).toEqual([3, 2]);
	});
});

describe("コレクションの種類と段（192）", () => {
	const form = (entries: [string, string][]) => {
		const data = new FormData();
		data.set("title", "題名");
		for (const [key, value] of entries) data.append(key, value);
		return data;
	};

	it("種類を受け取り、知らない値はリストにする", () => {
		const ranking = parseCollectionInput(form([["kind", "ranking"]]));
		expect(ranking.ok && ranking.value.kind).toBe("ranking");
		const unknown = parseCollectionInput(form([["kind", "bogus"]]));
		expect(unknown.ok && unknown.value.kind).toBe("list");
	});

	it("ティア表のときだけ段の名前を受け取り、空の段や長すぎる名前は断る", () => {
		const ok = parseCollectionInput(
			form([
				["kind", "tier"],
				["tier", " 神 "],
				["tier", "良"],
			]),
		);
		expect(ok.ok && ok.value.tiers).toEqual(["神", "良"]);
		expect(
			parseCollectionInput(
				form([
					["kind", "tier"],
					["tier", ""],
				]),
			),
		).toMatchObject({ ok: false, field: "tiers" });
		expect(
			parseCollectionInput(
				form([
					["kind", "tier"],
					["tier", "あ".repeat(11)],
				]),
			),
		).toMatchObject({
			ok: false,
			field: "tiers",
		});
		const list = parseCollectionInput(
			form([
				["kind", "list"],
				["tier", "S"],
			]),
		);
		expect(list.ok && list.value.tiers).toBeNull();
	});

	it("段の順に並べ直し、段の中は元の順のまま、未分類と無くなった段は最後に置く", () => {
		const items = [
			{ id: 1, tier: null },
			{ id: 2, tier: 1 },
			{ id: 3, tier: 0 },
			{ id: 4, tier: 5 },
			{ id: 5, tier: 1 },
		];
		expect(orderByTier(items, 2).map((item) => item.id)).toEqual([3, 2, 5, 1, 4]);
	});
});
