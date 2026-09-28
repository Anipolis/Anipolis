import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type RowSaveState, type SaveResult } from "./save-queue";

type Entry = { progress: number };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks() {
	for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("createSaveQueue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounces edits and saves only the latest value", async () => {
		const save = vi.fn(async (_key: string, _value: Entry): Promise<SaveResult> => ({ ok: true }));
		const queue = createSaveQueue<Entry>({ save, debounceMs: 500, savedTtlMs: 0 });

		queue.schedule("1", { progress: 1 });
		vi.advanceTimersByTime(200);
		queue.schedule("1", { progress: 2 });
		vi.advanceTimersByTime(499);
		expect(save).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		await flushMicrotasks();

		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("1", { progress: 2 });
		expect(queue.getState("1")?.status).toBe("saved");
	});

	it("serializes saves per row and re-sends the latest value after an in-flight request", async () => {
		const first = deferred<SaveResult>();
		const second = deferred<SaveResult>();
		const save = vi
			.fn<(key: string, value: Entry) => Promise<SaveResult>>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const states: RowSaveState<Entry>[] = [];
		const queue = createSaveQueue<Entry>({
			save,
			debounceMs: 500,
			savedTtlMs: 0,
			onChange: (_key, state) => states.push(state),
		});

		queue.schedule("1", { progress: 1 });
		vi.advanceTimersByTime(500);
		await flushMicrotasks();
		expect(save).toHaveBeenCalledTimes(1);
		expect(queue.getState("1")?.status).toBe("saving");

		// 1本目が応答待ちの間に次の編集が入る
		queue.schedule("1", { progress: 2 });
		vi.advanceTimersByTime(500);
		await flushMicrotasks();
		// 直列化されているので、1本目が終わるまで2本目は送らない
		expect(save).toHaveBeenCalledTimes(1);

		// 古い応答（失敗）が返っても最新値の状態は変わらず、2本目が最新値で送られる
		first.resolve({ ok: false, message: "old failure" });
		await flushMicrotasks();
		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith("1", { progress: 2 });
		expect(queue.getState("1")?.status).toBe("saving");
		expect(states.some((state) => state.status === "failed")).toBe(false);

		second.resolve({ ok: true });
		await flushMicrotasks();
		expect(queue.getState("1")).toEqual({ status: "saved", value: { progress: 2 }, error: null });
	});

	it("keeps rows independent so one row's in-flight save does not block another", async () => {
		const first = deferred<SaveResult>();
		const save = vi
			.fn<(key: string, value: Entry) => Promise<SaveResult>>()
			.mockReturnValueOnce(first.promise)
			.mockResolvedValue({ ok: true });
		const queue = createSaveQueue<Entry>({ save, debounceMs: 100, savedTtlMs: 0 });

		queue.schedule("1", { progress: 1 });
		queue.schedule("2", { progress: 5 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();

		expect(save).toHaveBeenCalledTimes(2);
		expect(queue.getState("1")?.status).toBe("saving");
		expect(queue.getState("2")?.status).toBe("saved");
	});

	it("marks a row failed on failure result, retains the value, and retries with it", async () => {
		const save = vi
			.fn<(key: string, value: Entry) => Promise<SaveResult>>()
			.mockResolvedValueOnce({ ok: false, message: "server error" })
			.mockResolvedValueOnce({ ok: true });
		const queue = createSaveQueue<Entry>({ save, debounceMs: 100, savedTtlMs: 0 });

		queue.schedule("1", { progress: 3 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();

		expect(queue.getState("1")).toEqual({ status: "failed", value: { progress: 3 }, error: "server error" });
		expect(queue.unsavedKeys()).toEqual(["1"]);

		queue.retry("1");
		await flushMicrotasks();

		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenLastCalledWith("1", { progress: 3 });
		expect(queue.getState("1")?.status).toBe("saved");
		expect(queue.unsavedKeys()).toEqual([]);
	});

	it("treats a thrown error (network failure) as a failed save", async () => {
		const save = vi.fn(async (): Promise<SaveResult> => {
			throw new TypeError("Failed to fetch");
		});
		const queue = createSaveQueue<Entry>({ save, debounceMs: 100, savedTtlMs: 0 });

		queue.schedule("1", { progress: 1 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();

		expect(queue.getState("1")).toEqual({ status: "failed", value: { progress: 1 }, error: "Failed to fetch" });
	});

	it("does nothing on retry when the row is not in a failed state", async () => {
		const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }));
		const queue = createSaveQueue<Entry>({ save, debounceMs: 100, savedTtlMs: 0 });

		queue.retry("missing");
		queue.schedule("1", { progress: 1 });
		queue.retry("1");
		await flushMicrotasks();

		expect(save).not.toHaveBeenCalled();
	});

	it("flush sends pending rows immediately", async () => {
		const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }));
		const queue = createSaveQueue<Entry>({ save, debounceMs: 500, savedTtlMs: 0 });

		queue.schedule("1", { progress: 1 });
		queue.schedule("2", { progress: 2 });
		expect(queue.unsavedKeys()).toEqual(["1", "2"]);

		queue.flush();
		await flushMicrotasks();

		expect(save).toHaveBeenCalledTimes(2);
		expect(queue.unsavedKeys()).toEqual([]);
	});

	it("cancel drops the pending save and ignores a late response", async () => {
		const first = deferred<SaveResult>();
		const save = vi.fn<(key: string, value: Entry) => Promise<SaveResult>>().mockReturnValueOnce(first.promise);
		const states: RowSaveState<Entry>[] = [];
		const queue = createSaveQueue<Entry>({
			save,
			debounceMs: 100,
			savedTtlMs: 0,
			onChange: (_key, state) => states.push(state),
		});

		queue.schedule("1", { progress: 1 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();
		queue.cancel("1");
		const countBefore = states.length;

		first.resolve({ ok: true });
		await flushMicrotasks();

		expect(states.length).toBe(countBefore);
		expect(queue.getState("1")).toBeUndefined();

		queue.schedule("2", { progress: 1 });
		queue.cancel("2");
		vi.advanceTimersByTime(100);
		await flushMicrotasks();
		expect(save).toHaveBeenCalledTimes(1);
	});

	it("still sends the edit that arrived during an in-flight save when the page is destroyed", async () => {
		// schedule(A) → flush → schedule(B) → flush → dispose → A 完了: B も送られること
		const pending = deferred<SaveResult>();
		const sent: Entry[] = [];
		const save = vi.fn(async (_key: string, value: Entry): Promise<SaveResult> => {
			sent.push(value);
			return sent.length === 1 ? pending.promise : { ok: true };
		});
		const onChange = vi.fn();
		const queue = createSaveQueue<Entry>({ save, onChange, debounceMs: 500, savedTtlMs: 1000 });

		queue.schedule("1", { progress: 1 });
		queue.flush();
		await flushMicrotasks();
		queue.schedule("1", { progress: 2 });
		queue.flush();
		queue.dispose();
		const changesBeforeResolve = onChange.mock.calls.length;

		pending.resolve({ ok: true });
		await flushMicrotasks();

		expect(sent).toEqual([{ progress: 1 }, { progress: 2 }]);
		// 破棄後は UI へ通知しない
		expect(onChange.mock.calls.length).toBe(changesBeforeResolve);
	});

	it("dispose sends rows that were still waiting for the debounce", async () => {
		const save = vi.fn(async (_key: string, _value: Entry): Promise<SaveResult> => ({ ok: true }));
		const queue = createSaveQueue<Entry>({ save, debounceMs: 500, savedTtlMs: 0 });

		queue.schedule("1", { progress: 3 });
		queue.dispose();
		await flushMicrotasks();

		expect(save).toHaveBeenCalledWith("1", { progress: 3 });
	});

	it("returns to idle after the saved TTL unless a new edit arrived", async () => {
		const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }));
		const queue = createSaveQueue<Entry>({ save, debounceMs: 100, savedTtlMs: 1000 });

		queue.schedule("1", { progress: 1 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();
		expect(queue.getState("1")?.status).toBe("saved");

		vi.advanceTimersByTime(1000);
		expect(queue.getState("1")?.status).toBe("idle");

		queue.schedule("1", { progress: 2 });
		vi.advanceTimersByTime(100);
		await flushMicrotasks();
		expect(queue.getState("1")?.status).toBe("saved");
		// 新しい編集が入ったら saved 表示のタイマーは取り消され pending になる
		queue.schedule("1", { progress: 3 });
		vi.advanceTimersByTime(50);
		expect(queue.getState("1")?.status).toBe("pending");
	});
});
