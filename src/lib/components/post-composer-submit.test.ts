import { describe, expect, it } from "vitest";
import { classifyComposerSubmitResult, FAILURE_FALLBACK_MESSAGE, NETWORK_ERROR_MESSAGE } from "./post-composer-submit";

describe("classifyComposerSubmitResult", () => {
	it("clears the form only on success", () => {
		expect(classifyComposerSubmitResult({ type: "success", status: 200 })).toEqual({ kind: "success" });
	});

	it("keeps the input and shows the server message on failure", () => {
		expect(
			classifyComposerSubmitResult({ type: "failure", status: 400, data: { message: "文字数が多すぎます" } }),
		).toEqual({ kind: "retry", message: "文字数が多すぎます" });
	});

	it("falls back to a retry hint when the failure carries no message", () => {
		expect(classifyComposerSubmitResult({ type: "failure", status: 500 })).toEqual({
			kind: "retry",
			message: FAILURE_FALLBACK_MESSAGE,
		});
	});

	it("treats network and server exceptions as retryable instead of rendering the error page", () => {
		expect(classifyComposerSubmitResult({ type: "error", status: 500, error: new Error("offline") })).toEqual({
			kind: "retry",
			message: NETWORK_ERROR_MESSAGE,
		});
	});

	it("lets redirects pass through to SvelteKit", () => {
		expect(classifyComposerSubmitResult({ type: "redirect", status: 303, location: "/" })).toEqual({
			kind: "passthrough",
		});
	});
});
