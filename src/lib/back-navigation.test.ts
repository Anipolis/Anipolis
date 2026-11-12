import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
	vi.resetModules();
	return import("./back-navigation");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("canGoBackInApp", () => {
	it("Navigation API があれば、同じサイトの直前の履歴があるかで決める", async () => {
		const { canGoBackInApp } = await load();
		vi.stubGlobal("navigation", { currentEntry: { index: 0 } });
		expect(canGoBackInApp()).toBe(false);
		vi.stubGlobal("navigation", { currentEntry: { index: 2 } });
		expect(canGoBackInApp()).toBe(true);
	});

	it("Navigation API が無ければ、アプリ内の遷移があったかで決める", async () => {
		const { canGoBackInApp, recordNavigation } = await load();
		vi.stubGlobal("navigation", undefined);
		recordNavigation("enter");
		expect(canGoBackInApp()).toBe(false);
		recordNavigation("link");
		expect(canGoBackInApp()).toBe(true);
	});
});
