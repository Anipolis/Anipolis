export class ConsecutiveStatusCircuitBreaker {
	private consecutiveMatches = 0;
	private readonly targetStatus: number;
	private readonly threshold: number;

	constructor(targetStatus: number, threshold: number) {
		if (!Number.isInteger(threshold) || threshold < 1) {
			throw new Error("Circuit breaker threshold must be a positive integer.");
		}

		this.targetStatus = targetStatus;
		this.threshold = threshold;
	}

	record(status: number) {
		this.consecutiveMatches = status === this.targetStatus ? this.consecutiveMatches + 1 : 0;
		return this.consecutiveMatches >= this.threshold;
	}

	get consecutiveCount() {
		return this.consecutiveMatches;
	}
}

export type ImportCompleteness = {
	expectedCount: number;
	successfulCount: number;
	ratio: number;
	missingIds: number[];
};

export function summarizeImportCompleteness(
	expectedIds: readonly number[],
	successfulIds: readonly number[],
): ImportCompleteness {
	const expected = [...new Set(expectedIds)];
	const expectedSet = new Set(expected);
	const successfulSet = new Set(successfulIds.filter((id) => expectedSet.has(id)));
	const missingIds = expected.filter((id) => !successfulSet.has(id));

	return {
		expectedCount: expected.length,
		successfulCount: successfulSet.size,
		ratio: expected.length === 0 ? 0 : successfulSet.size / expected.length,
		missingIds,
	};
}

export function meetsMinimumCompleteness(completeness: ImportCompleteness, minimumRatio: number) {
	if (minimumRatio < 0 || minimumRatio > 1) {
		throw new Error("Minimum completeness ratio must be between 0 and 1.");
	}

	return completeness.expectedCount > 0 && completeness.ratio >= minimumRatio;
}
