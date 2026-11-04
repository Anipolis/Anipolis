import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Anime } from "$lib/types";

vi.mock("$app/state", () => ({ page: { data: { user: { id: "user-1" } } } }));

import TrendingPanel from "./TrendingPanel.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function renderPanel(animeTrending: Partial<Anime>[]) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(TrendingPanel, {
		target,
		props: { trending: [], animeTrending: animeTrending as Anime[] },
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

describe("アニメトレンドの画像の並び", () => {
	it("画像だけでも順位・題名・件数を読み上げられる", () => {
		const target = renderPanel([
			{ id: "1", title: "作品A", cover_url: "https://example.com/a.avif", recent_count: 12 },
		]);
		const tile = target.querySelector(".anime-trending-tile");
		expect(tile?.getAttribute("aria-label")).toBe("1位 作品A 12件");
		expect(tile?.getAttribute("href")).toBe("/anime/1");
	});

	it("カバーを出さない作品は題名を文字で出す枠にする", () => {
		const target = renderPanel([{ id: "1", title: "作品A", cover_url: null, recent_count: 3 }]);
		const tile = target.querySelector(".anime-trending-tile");
		expect(tile?.classList.contains("anime-trending-tile--no-cover")).toBe(true);
		expect(tile?.querySelector("img")).toBeNull();
		expect(tile?.textContent).toContain("作品A");
	});

	it("順位ごとに1行ずつずらして置く", () => {
		const target = renderPanel([
			{ id: "1", title: "作品A", cover_url: null, recent_count: 3 },
			{ id: "2", title: "作品B", cover_url: null, recent_count: 2 },
		]);
		const rows = [...target.querySelectorAll<HTMLElement>(".anime-trending-grid li")].map((li) => li.style.gridRow);
		expect(rows).toEqual(["1 / span 2", "2 / span 2"]);
	});
});
