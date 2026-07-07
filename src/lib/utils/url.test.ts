import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirect } from "./url";

describe("sanitizeInternalRedirect", () => {
	it("サイト内パスはそのまま返す", () => {
		expect(sanitizeInternalRedirect("/")).toBe("/");
		expect(sanitizeInternalRedirect("/anime/123")).toBe("/anime/123");
		expect(sanitizeInternalRedirect("/search?q=%E3%83%86%E3%82%B9%E3%83%88")).toBe(
			"/search?q=%E3%83%86%E3%82%B9%E3%83%88",
		);
	});

	it("null / undefined / 空文字は / にフォールバックする", () => {
		expect(sanitizeInternalRedirect(null)).toBe("/");
		expect(sanitizeInternalRedirect(undefined)).toBe("/");
		expect(sanitizeInternalRedirect("")).toBe("/");
	});

	it("絶対 URL・プロトコル相対 URL を拒否する", () => {
		expect(sanitizeInternalRedirect("https://evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("http://evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("//evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/redirect?to=https://evil.com")).toBe("/");
	});

	it("スキーム付きの値を拒否する", () => {
		expect(sanitizeInternalRedirect("javascript:/alert(1)")).toBe("/");
		expect(sanitizeInternalRedirect("mailto:/a@b.c")).toBe("/");
	});

	it("バックスラッシュによるプロトコル相対バイパスを拒否する", () => {
		// ブラウザは Location ヘッダーの \ を / に正規化するため
		// /\evil.com は //evil.com として外部へリダイレクトされる
		expect(sanitizeInternalRedirect("/\\evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\\/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("\\/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/path\\..\\evil")).toBe("/");
	});
});
