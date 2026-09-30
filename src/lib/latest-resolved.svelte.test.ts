import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { createLatestResolved } from "./latest-resolved.svelte";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function settle() {
	for (let i = 0; i < 5; i += 1) await Promise.resolve();
	flushSync();
}

describe("createLatestResolved", () => {
	it("keeps the previous value while a newer promise is pending", async () => {
		let source = $state<Promise<string[]>>(Promise.resolve(["a"]));
		let latest!: ReturnType<typeof createLatestResolved<string[]>>;
		const stop = $effect.root(() => {
			latest = createLatestResolved(() => source);
		});
		flushSync();
		expect(latest.pending).toBe(true);
		expect(latest.value).toBeNull();

		await settle();
		expect(latest.value).toEqual(["a"]);
		expect(latest.pending).toBe(false);

		// load の再実行: 新しい Promise が来ても解決までは前回の一覧を返す
		const next = deferred<string[]>();
		source = next.promise;
		flushSync();
		expect(latest.pending).toBe(true);
		expect(latest.value).toEqual(["a"]);

		next.resolve(["b"]);
		await settle();
		expect(latest.value).toEqual(["b"]);
		expect(latest.pending).toBe(false);
		stop();
	});

	it("ignores a stale promise that resolves after a newer one replaced it", async () => {
		const first = deferred<string>();
		let source = $state<Promise<string>>(first.promise);
		let latest!: ReturnType<typeof createLatestResolved<string>>;
		const stop = $effect.root(() => {
			latest = createLatestResolved(() => source);
		});
		flushSync();

		source = Promise.resolve("new");
		flushSync();
		await settle();
		expect(latest.value).toBe("new");

		first.resolve("stale");
		await settle();
		expect(latest.value).toBe("new");
		stop();
	});

	it("drops the held value when the list identity changes", async () => {
		let source = $state<Promise<string[]>>(Promise.resolve(["all-1"]));
		let key = $state("all");
		let latest!: ReturnType<typeof createLatestResolved<string[]>>;
		const stop = $effect.root(() => {
			latest = createLatestResolved(
				() => source,
				() => key,
			);
		});
		flushSync();
		await settle();
		expect(latest.value).toEqual(["all-1"]);

		// 同じ一覧の再取得: 保持する
		const refetch = deferred<string[]>();
		source = refetch.promise;
		flushSync();
		expect(latest.value).toEqual(["all-1"]);
		refetch.resolve(["all-2"]);
		await settle();

		// タブ切替: 前の一覧を捨てて待機表示に戻す
		const other = deferred<string[]>();
		key = "following";
		source = other.promise;
		flushSync();
		expect(latest.value).toBeNull();
		expect(latest.pending).toBe(true);
		other.resolve(["following-1"]);
		await settle();
		expect(latest.value).toEqual(["following-1"]);
		stop();
	});

	it("takes a non-promise value synchronously so server rendering can show it", () => {
		let latest!: ReturnType<typeof createLatestResolved<number[]>>;
		const stop = $effect.root(() => {
			latest = createLatestResolved(() => [1, 2]);
		});
		expect(latest.value).toEqual([1, 2]);
		expect(latest.pending).toBe(false);
		stop();
	});

	it("exposes a rejection and clears it on the next success", async () => {
		let source = $state<Promise<number>>(Promise.reject(new Error("boom")));
		let latest!: ReturnType<typeof createLatestResolved<number>>;
		const stop = $effect.root(() => {
			latest = createLatestResolved(() => source);
		});
		flushSync();
		await settle();
		expect(latest.error).toBeInstanceOf(Error);
		expect(latest.value).toBeNull();

		source = Promise.resolve(1);
		flushSync();
		await settle();
		expect(latest.error).toBeNull();
		expect(latest.value).toBe(1);
		stop();
	});
});
