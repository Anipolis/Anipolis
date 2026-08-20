import { describe, expect, it } from "vitest";
import {
	ConsecutiveStatusCircuitBreaker,
	meetsMinimumCompleteness,
	summarizeImportCompleteness,
} from "./jikan-import-resilience";

describe("ConsecutiveStatusCircuitBreaker", () => {
	it("opens after the configured number of consecutive target statuses", () => {
		const breaker = new ConsecutiveStatusCircuitBreaker(504, 3);

		expect(breaker.record(504)).toBe(false);
		expect(breaker.record(504)).toBe(false);
		expect(breaker.record(504)).toBe(true);
		expect(breaker.consecutiveCount).toBe(3);
	});

	it("resets when a different response status is observed", () => {
		const breaker = new ConsecutiveStatusCircuitBreaker(504, 2);

		expect(breaker.record(504)).toBe(false);
		expect(breaker.record(200)).toBe(false);
		expect(breaker.record(504)).toBe(false);
		expect(breaker.consecutiveCount).toBe(1);
	});
});

describe("summarizeImportCompleteness", () => {
	it("deduplicates IDs and reports missing expected entries", () => {
		const summary = summarizeImportCompleteness([1, 2, 2, 3], [1, 1, 3, 99]);

		expect(summary).toEqual({
			expectedCount: 3,
			successfulCount: 2,
			ratio: 2 / 3,
			missingIds: [2],
		});
	});

	it("reports zero completeness when no candidates were found", () => {
		expect(summarizeImportCompleteness([], [])).toEqual({
			expectedCount: 0,
			successfulCount: 0,
			ratio: 0,
			missingIds: [],
		});
	});

	it("enforces the configured minimum completion ratio", () => {
		const belowThreshold = summarizeImportCompleteness(
			Array.from({ length: 100 }, (_, index) => index),
			Array.from({ length: 94 }, (_, index) => index),
		);
		const atThreshold = summarizeImportCompleteness(
			Array.from({ length: 100 }, (_, index) => index),
			Array.from({ length: 95 }, (_, index) => index),
		);

		expect(meetsMinimumCompleteness(belowThreshold, 0.95)).toBe(false);
		expect(meetsMinimumCompleteness(atThreshold, 0.95)).toBe(true);
	});
});
