import { describe, expect, it } from "vitest";
import { isPlatformCopyright, isPlatformPageUrl, isXUrl } from "./copyright-platform";

describe("copyright platform detection", () => {
	it("recognizes platform footers but not committees whose names merely contain the letters", () => {
		expect(isPlatformCopyright("© 2026 X Corp.")).toBe(true);
		expect(isPlatformCopyright("© 2026 Google LLC")).toBe(true);
		expect(isPlatformCopyright("©2025 Valve Corporation. Steam及びSteamロゴは…")).toBe(true);
		expect(isPlatformCopyright("©Index Corporation/「ペルソナ4」アニメーション製作委員会")).toBe(false);
		expect(isPlatformCopyright(null)).toBe(false);
	});

	it("recognizes SNS and video pages used as an official site", () => {
		expect(isPlatformPageUrl("https://youtu.be/abc")).toBe(true);
		expect(isPlatformPageUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
		expect(isPlatformPageUrl("https://twitter.com/aharen_pr")).toBe(true);
		expect(isPlatformPageUrl("https://umamusume.jp/")).toBe(false);
		expect(isXUrl("https://mobile.twitter.com/khara_inc2/status/1")).toBe(true);
		expect(isXUrl("https://youtu.be/abc")).toBe(false);
	});
});
