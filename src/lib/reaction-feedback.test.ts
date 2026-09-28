import { describe, expect, it } from "vitest";
import { isReactionFailure, reactionFailureMessage } from "./reaction-feedback";

describe("isReactionFailure", () => {
	it("treats failure and thrown errors as failures", () => {
		expect(isReactionFailure({ type: "failure", status: 403 })).toBe(true);
		expect(isReactionFailure({ type: "error", status: 500 })).toBe(true);
	});

	it("does not treat success or redirect as failures", () => {
		expect(isReactionFailure({ type: "success", status: 200 })).toBe(false);
		expect(isReactionFailure({ type: "redirect", status: 303 })).toBe(false);
	});
});

describe("reactionFailureMessage", () => {
	it("prefers the server-provided message on failure", () => {
		expect(
			reactionFailureMessage("like", { type: "failure", status: 401, data: { message: "ログインが必要です" } }),
		).toBe("ログインが必要です");
	});

	it("falls back to a per-kind generic message when the failure has no usable message", () => {
		expect(reactionFailureMessage("like", { type: "failure", status: 500 })).toBe("いいねに失敗しました");
		expect(reactionFailureMessage("repost", { type: "failure", status: 500, data: { message: "   " } })).toBe(
			"リポストに失敗しました",
		);
		expect(reactionFailureMessage("bookmark", { type: "failure", status: 500, data: { message: 42 } })).toBe(
			"ブックマークに失敗しました",
		);
	});

	it("explains thrown errors as a communication problem", () => {
		expect(reactionFailureMessage("repost", { type: "error", status: 500 })).toBe(
			"通信エラーのためリポストを反映できませんでした",
		);
	});
});
