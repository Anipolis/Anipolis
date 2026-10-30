import { describe, expect, it } from "vitest";
import { parseCollectionInput, withAnimeAdded, withAnimeRemoved } from "./collections";

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
			value: { title: "実況が盛り上がる作品", description: null, isPublic: true },
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
