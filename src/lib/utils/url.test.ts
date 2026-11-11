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

	it("制御文字によるプロトコル相対バイパスを拒否する", () => {
		// URL パーサーは TAB・改行を捨てるため、/<TAB>/evil.com は //evil.com として外部へリダイレクトされる
		expect(new URL("/\t/evil.com", "https://anipolis.example/auth").origin).toBe("https://evil.com");
		expect(sanitizeInternalRedirect("/\t/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\t\t/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\n/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\r/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\u0000/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/\u007f/evil.com")).toBe("/");
		expect(sanitizeInternalRedirect("/anime/123\t")).toBe("/");
		// ?next=/%09/evil.com は URLSearchParams が TAB に戻してから渡ってくる
		expect(sanitizeInternalRedirect(new URLSearchParams("next=/%09/evil.com").get("next"))).toBe("/");
	});

	it("サイト内に留まる値は、エンコードされた文字を含んでいてもそのまま返す", () => {
		// 二重にエンコードされた %09 は TAB に戻らないので、サイト内のパスのまま
		expect(sanitizeInternalRedirect("/search?q=%09")).toBe("/search?q=%09");
		expect(sanitizeInternalRedirect("/.//evil.com")).toBe("/.//evil.com");
		expect(new URL("/.//evil.com", "https://anipolis.example").origin).toBe("https://anipolis.example");
		expect(sanitizeInternalRedirect("/rooms/anime/1/ep/2?tab=log#latest")).toBe(
			"/rooms/anime/1/ep/2?tab=log#latest",
		);
	});
});
