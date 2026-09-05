import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry, getHttpRetryDelayMs } from "./http-retry";

function response(status: number, headers?: HeadersInit): Response {
	const init: ResponseInit = { status };
	if (headers) init.headers = headers;
	return new Response(status === 200 ? JSON.stringify({ ok: true }) : "upstream error", init);
}

describe("getHttpRetryDelayMs", () => {
	it("honors a numeric Retry-After value", () => {
		expect(getHttpRetryDelayMs(response(429, { "Retry-After": "3" }), 0)).toBe(3_000);
	});

	it("honors an HTTP-date Retry-After value", () => {
		const now = Date.parse("Tue, 15 Nov 1994 08:12:31 GMT");
		const retryAt = "Tue, 15 Nov 1994 08:12:41 GMT";

		expect(getHttpRetryDelayMs(response(503, { "Retry-After": retryAt }), 0, now)).toBe(10_000);
	});

	it("falls back to capped exponential backoff", () => {
		expect(getHttpRetryDelayMs(null, 0)).toBe(2_000);
		expect(getHttpRetryDelayMs(null, 5)).toBe(60_000);
	});
});

describe("fetchWithRetry", () => {
	it("retries transient responses and stops at a successful response", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(response(429, { "Retry-After": "0" }))
			.mockResolvedValueOnce(response(200));
		const sleep = vi.fn();

		const result = await fetchWithRetry("https://example.test", undefined, {
			maxRetries: 2,
			sleep,
		});

		expect(result.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(0);
		fetchMock.mockRestore();
	});

	it("does not retry permanent client errors", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(400));
		const sleep = vi.fn();

		const result = await fetchWithRetry("https://example.test", undefined, { sleep });

		expect(result.status).toBe(400);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
		fetchMock.mockRestore();
	});

	it("retries network failures with a bounded timeout signal", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connection reset"));
		const sleep = vi.fn();
		const signals: AbortSignal[] = [];
		fetchMock.mockImplementationOnce(async (_input, init) => {
			if (init?.signal) signals.push(init.signal);
			return response(200);
		});
		fetchMock.mockImplementation(async (_input, init) => {
			if (init?.signal) signals.push(init.signal);
			return response(200);
		});

		const result = await fetchWithRetry("https://example.test", undefined, {
			maxRetries: 1,
			timeoutMs: 1_000,
			sleep,
		});

		expect(result.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(signals).toHaveLength(1);
		expect(signals[0]).toBeInstanceOf(AbortSignal);
		fetchMock.mockRestore();
	});
});
