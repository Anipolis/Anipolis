import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedCommit } from "./debounced-commit";

describe("createDebouncedCommit", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("commits only the last value once the edits stop", () => {
		const commit = vi.fn();
		const sync = createDebouncedCommit<string>(commit);

		sync.schedule("ぼ", 400, true);
		vi.advanceTimersByTime(200);
		sync.schedule("ぼっ", 400, true);
		vi.advanceTimersByTime(399);
		expect(commit).not.toHaveBeenCalled();
		expect(sync.pending).toBe(true);

		vi.advanceTimersByTime(1);
		expect(commit).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenCalledWith("ぼっ", true);
		expect(sync.pending).toBe(false);
	});

	it("replaces history if any batched edit asked for it", () => {
		const commit = vi.fn();
		const sync = createDebouncedCommit<string>(commit);

		sync.schedule("typed", 400, true);
		sync.schedule("then a chip", 250, false);
		vi.advanceTimersByTime(250);

		expect(commit).toHaveBeenCalledWith("then a chip", true);
	});

	it("never fires after cancel, e.g. when leaving the page mid-edit", () => {
		const commit = vi.fn();
		const sync = createDebouncedCommit<string>(commit);

		sync.schedule("test", 400, true);
		sync.cancel();
		vi.advanceTimersByTime(1000);

		expect(commit).not.toHaveBeenCalled();
		expect(sync.pending).toBe(false);
	});

	it("reports no pending edit while its own commit runs, so a navigation guard does not cancel it", () => {
		const seenPending: boolean[] = [];
		const sync = createDebouncedCommit<string>(() => {
			seenPending.push(sync.pending);
		});

		sync.schedule("x", 100);
		vi.advanceTimersByTime(100);

		expect(seenPending).toEqual([false]);
	});

	it("resets the replace flag after a commit", () => {
		const commit = vi.fn();
		const sync = createDebouncedCommit<string>(commit);

		sync.schedule("typed", 400, true);
		vi.advanceTimersByTime(400);
		sync.schedule("chip", 250, false);
		vi.advanceTimersByTime(250);

		expect(commit).toHaveBeenLastCalledWith("chip", false);
	});
});
