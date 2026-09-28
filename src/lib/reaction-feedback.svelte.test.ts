import { describe, expect, it, vi } from "vitest";
import { createReactionFeedback } from "./reaction-feedback.svelte";

const failure = { type: "failure" as const, status: 401, data: { message: "ログインが必要です" } };

describe("createReactionFeedback retry targets", () => {
	it("re-submits a form that is still in the document", () => {
		const form = document.createElement("form");
		document.body.append(form);
		const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
		const feedback = createReactionFeedback(0);

		feedback.fail("like", failure, form);
		expect(feedback.canRetry).toBe(true);
		feedback.retry();

		expect(submit).toHaveBeenCalledTimes(1);
		expect(feedback.message).toBe("");
		form.remove();
	});

	it("offers no retry for a form that was already removed from the document", () => {
		const form = document.createElement("form");
		const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
		const feedback = createReactionFeedback(0);

		feedback.fail("repost", failure, form);

		expect(feedback.message).toContain("ログインが必要です");
		expect(feedback.canRetry).toBe(false);
		feedback.retry();
		expect(submit).not.toHaveBeenCalled();
	});

	it("runs a retry callback for forms that are recreated on demand", () => {
		const retry = vi.fn();
		const feedback = createReactionFeedback(0);

		feedback.fail("repost", failure, retry);
		expect(feedback.canRetry).toBe(true);
		feedback.retry();

		expect(retry).toHaveBeenCalledTimes(1);
	});
});
