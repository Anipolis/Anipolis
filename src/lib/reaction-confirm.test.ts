import { describe, expect, it } from "vitest";
import { confirmReaction } from "./reaction-confirm";

describe("confirmReaction", () => {
	it("uses the count the server returns over the guess from the displayed count", () => {
		// 件数の取得に失敗して 0 件・未いいねと表示されていた投稿（実際は10件・いいね済み）
		const result = {
			type: "success" as const,
			status: 200,
			data: { liked: true, count: 10 },
		};
		expect(confirmReaction("like", result, { wasActive: false, countBefore: 0 })).toEqual({
			active: true,
			count: 10,
		});
	});

	it("keeps the optimistic toggle when the server agrees", () => {
		expect(
			confirmReaction(
				"like",
				{ type: "success", status: 200, data: { liked: true } },
				{ wasActive: false, countBefore: 5 },
			),
		).toEqual({ active: true, count: 6 });
		expect(
			confirmReaction(
				"like",
				{ type: "success", status: 200, data: { liked: false } },
				{ wasActive: true, countBefore: 5 },
			),
		).toEqual({ active: false, count: 4 });
	});

	it("corrects the count when the server reports the state had already changed elsewhere", () => {
		// 別タブで既にいいね済みだった: 押したがサーバーは「解除した」と答える
		expect(
			confirmReaction(
				"like",
				{ type: "success", status: 200, data: { liked: false } },
				{ wasActive: false, countBefore: 5 },
			),
		).toEqual({ active: false, count: 5 });
	});

	it("reads the matching flag for each reaction kind", () => {
		expect(
			confirmReaction(
				"bookmark",
				{ type: "success", status: 200, data: { bookmarked: true } },
				{ wasActive: false, countBefore: 0 },
			).active,
		).toBe(true);
		expect(
			confirmReaction(
				"repost",
				{ type: "success", status: 200, data: { reposted: false } },
				{ wasActive: true, countBefore: 2 },
			),
		).toEqual({ active: false, count: 1 });
	});

	it("falls back to the optimistic state when the result carries no flag and never goes negative", () => {
		expect(confirmReaction("like", { type: "success", status: 200 }, { wasActive: false, countBefore: 0 })).toEqual(
			{
				active: true,
				count: 1,
			},
		);
		expect(confirmReaction("like", { type: "success", status: 200 }, { wasActive: true, countBefore: 0 })).toEqual({
			active: false,
			count: 0,
		});
	});
});
