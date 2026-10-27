import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

import type { Anime } from "$lib/types";
import FavoriteAnimeShelf from "./FavoriteAnimeShelf.svelte";

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
});

function render(props: { favorites: Anime[] | null; isOwn: boolean }) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(FavoriteAnimeShelf, { target, props });
	flushSync();
	cleanup = () => {
		unmount(component);
		target.remove();
	};
	return target;
}

const anime = { id: "1", title: "作品A", cover_url: null } as Anime;

describe("ベスト作品", () => {
	it("読み込みに失敗したときは、本人にも編集や選ぶ入口を出さない（空と取り違えて上書きしない）", () => {
		const target = render({ favorites: null, isOwn: true });
		expect(target.textContent).toContain("ベスト作品を読み込めませんでした");
		expect(target.querySelector("button")).toBeNull();
	});

	it("読み込みに失敗したとき、ほかの人には何も出さない", () => {
		const target = render({ favorites: null, isOwn: false });
		expect(target.textContent?.trim()).toBe("");
	});

	it("未登録なら本人にだけ入口を出す", () => {
		expect(render({ favorites: [], isOwn: true }).textContent).toContain("ベスト作品を選ぶ");
		cleanup?.();
		expect(render({ favorites: [], isOwn: false }).textContent?.trim()).toBe("");
	});

	it("編集を開くと、保存済みの作品が並んだ状態から始まる", () => {
		const target = render({ favorites: [anime], isOwn: true });
		const edit = [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === "編集");
		edit?.click();
		flushSync();
		expect(document.querySelector(".favorite-picks")?.textContent).toContain("作品A");
	});
});
