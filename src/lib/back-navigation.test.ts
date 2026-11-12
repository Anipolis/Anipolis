import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
	vi.resetModules();
	return import("./back-navigation");
}

/** SvelteKit と同じく history.state に履歴の通し番号を入れる */
function setHistoryIndex(index: number) {
	vi.stubGlobal("history", { state: { "sveltekit:history": index } });
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

	it("Navigation API が無ければ、読み込んだ位置より先にいるかで決める", async () => {
		const { canGoBackInApp, recordNavigation } = await load();
		vi.stubGlobal("navigation", undefined);
		setHistoryIndex(100);
		recordNavigation("enter");
		expect(canGoBackInApp()).toBe(false);

		setHistoryIndex(101);
		recordNavigation("link");
		expect(canGoBackInApp()).toBe(true);

		// 読み込んだページへ履歴で戻ったら、外へ出ないように親へ送る
		setHistoryIndex(100);
		recordNavigation("popstate");
		expect(canGoBackInApp()).toBe(false);
	});
});
