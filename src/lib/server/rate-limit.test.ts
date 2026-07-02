import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiRateLimited, isRateLimited } from "./rate-limit";

describe("isRateLimited", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows requests within the limit", () => {
		const key = `test-${Math.random()}`;
		expect(isRateLimited(key, 3, 1000)).toBe(false);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
	});

	it("blocks requests over the limit", () => {
		const key = `test-${Math.random()}`;
		for (let i = 0; i < 3; i += 1) isRateLimited(key, 3, 1000);
		expect(isRateLimited(key, 3, 1000)).toBe(true);
	});

	it("resets counts after the window", () => {
		const key = `test-${Math.random()}`;
		for (let i = 0; i < 4; i += 1) isRateLimited(key, 3, 1000);
		expect(isRateLimited(key, 3, 1000)).toBe(true);
		vi.advanceTimersByTime(1001);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
	});

	it("counts each key independently", () => {
		const keyA = `test-a-${Math.random()}`;
		const keyB = `test-b-${Math.random()}`;
		for (let i = 0; i < 4; i += 1) isRateLimited(keyA, 3, 1000);
		expect(isRateLimited(keyB, 3, 1000)).toBe(false);
	});
});

describe("isApiRateLimited", () => {
	it("does not limit unmatched paths", () => {
		for (let i = 0; i < 100; i += 1) {
			expect(isApiRateLimited("/api/unknown", "GET", "ip-x")).toBe(false);
		}
	});

	it("does not apply method-specific rules to other methods", () => {
		for (let i = 0; i < 100; i += 1) {
			expect(isApiRateLimited("/api/posts", "GET", "ip-method-test")).toBe(false);
		}
	});

	it("limits uploads over 10 requests per minute", () => {
		const ip = `ip-${Math.random()}`;
		for (let i = 0; i < 10; i += 1) {
			expect(isApiRateLimited("/api/upload", "POST", ip)).toBe(false);
		}
		expect(isApiRateLimited("/api/upload", "POST", ip)).toBe(true);
	});

	it("keeps search limits isolated by IP", () => {
		const ipA = `ip-a-${Math.random()}`;
		const ipB = `ip-b-${Math.random()}`;
		for (let i = 0; i < 31; i += 1) isApiRateLimited("/api/anime/search", "GET", ipA);
		expect(isApiRateLimited("/api/anime/search", "GET", ipA)).toBe(true);
		expect(isApiRateLimited("/api/anime/search", "GET", ipB)).toBe(false);
	});

	it("limits room experiment visit creation by POST", () => {
		const ip = `ip-room-experiment-create-${Math.random()}`;
		for (let i = 0; i < 60; i += 1) {
			expect(isApiRateLimited("/api/room-experiment-visits", "POST", ip)).toBe(false);
		}
		expect(isApiRateLimited("/api/room-experiment-visits", "POST", ip)).toBe(true);
		expect(isApiRateLimited("/api/room-experiment-visits", "GET", ip)).toBe(false);
	});

	it("shares a bucket for room experiment heartbeat and exit", () => {
		const ip = `ip-room-experiment-update-${Math.random()}`;
		const visitId = "00000000-0000-4000-8000-000000000001";
		for (let i = 0; i < 180; i += 1) {
			expect(isApiRateLimited(`/api/room-experiment-visits/${visitId}/heartbeat`, "POST", ip)).toBe(false);
		}
		expect(isApiRateLimited(`/api/room-experiment-visits/${visitId}/exit`, "POST", ip)).toBe(true);
		expect(isApiRateLimited(`/api/room-experiment-visits/${visitId}/heartbeat`, "GET", ip)).toBe(false);
	});

	it("limits room exit survey submissions by POST", () => {
		const ip = `ip-room-exit-survey-${Math.random()}`;
		for (let i = 0; i < 20; i += 1) {
			expect(isApiRateLimited("/api/room-exit-surveys", "POST", ip)).toBe(false);
		}
		expect(isApiRateLimited("/api/room-exit-surveys", "POST", ip)).toBe(true);
		expect(isApiRateLimited("/api/room-exit-surveys", "GET", ip)).toBe(false);
	});
});
