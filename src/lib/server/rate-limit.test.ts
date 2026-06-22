import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiRateLimited, isRateLimited } from "./rate-limit";

describe("isRateLimited", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("制限内のリクエストは許可される", () => {
		const key = `test-${Math.random()}`;
		expect(isRateLimited(key, 3, 1000)).toBe(false);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
	});

	it("制限を超えたリクエストは拒否される", () => {
		const key = `test-${Math.random()}`;
		for (let i = 0; i < 3; i += 1) isRateLimited(key, 3, 1000);
		expect(isRateLimited(key, 3, 1000)).toBe(true);
	});

	it("ウィンドウが過ぎるとカウントがリセットされる", () => {
		const key = `test-${Math.random()}`;
		for (let i = 0; i < 4; i += 1) isRateLimited(key, 3, 1000);
		expect(isRateLimited(key, 3, 1000)).toBe(true);
		vi.advanceTimersByTime(1001);
		expect(isRateLimited(key, 3, 1000)).toBe(false);
	});

	it("キーごとに独立してカウントされる", () => {
		const keyA = `test-a-${Math.random()}`;
		const keyB = `test-b-${Math.random()}`;
		for (let i = 0; i < 4; i += 1) isRateLimited(keyA, 3, 1000);
		expect(isRateLimited(keyB, 3, 1000)).toBe(false);
	});
});

describe("isApiRateLimited", () => {
	it("ルールにマッチしないパスは制限されない", () => {
		for (let i = 0; i < 100; i += 1) {
			expect(isApiRateLimited("/api/unknown", "GET", "ip-x")).toBe(false);
		}
	});

	it("メソッド指定のあるルールは他メソッドに適用されない", () => {
		for (let i = 0; i < 100; i += 1) {
			expect(isApiRateLimited("/api/posts", "GET", "ip-method-test")).toBe(false);
		}
	});

	it("アップロードは10回/分を超えると429相当になる", () => {
		const ip = `ip-${Math.random()}`;
		for (let i = 0; i < 10; i += 1) {
			expect(isApiRateLimited("/api/upload", "POST", ip)).toBe(false);
		}
		expect(isApiRateLimited("/api/upload", "POST", ip)).toBe(true);
	});

	it("検索はIPごとに独立して制限される", () => {
		const ipA = `ip-a-${Math.random()}`;
		const ipB = `ip-b-${Math.random()}`;
		for (let i = 0; i < 31; i += 1) isApiRateLimited("/api/anime/search", "GET", ipA);
		expect(isApiRateLimited("/api/anime/search", "GET", ipA)).toBe(true);
		expect(isApiRateLimited("/api/anime/search", "GET", ipB)).toBe(false);
	});
});
