import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import CollectionReorder from "./CollectionReorder.svelte";

type Item = { id: number; title: string; cover_url: string | null; tier: number | null };

const items: Item[] = [
	{ id: 1, title: "一", cover_url: null, tier: null },
	{ id: 2, title: "二", cover_url: null, tier: null },
	{ id: 3, title: "三", cover_url: null, tier: null },
];

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function render(disabled = false, tiers?: string[], list: Item[] = items) {
	const onchange = vi.fn((_ids: number[], _tiers: (number | null)[]) => {});
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(CollectionReorder, { target, props: { items: list, onchange, disabled, tiers } });
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	const card = (index: number) => target.querySelector<HTMLElement>(`[data-reorder-index="${index}"]`);
	return { onchange, card };
}

const press = (el: HTMLElement | null, key: string) =>
	el?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

it("矢印キーで動かし、Delete で外すたびに、その並びを知らせる", async () => {
	const { card, onchange } = render();
	await tick();
	press(card(0), "ArrowRight");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 1, 3], [null, null, null]);
	// 動かした作品にキーボードの位置が付いていく
	expect(document.activeElement).toBe(card(1));
	press(card(2), "Delete");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 1], [null, null]);
});

it("端より先へは動かさない", async () => {
	const { card, onchange } = render();
	await tick();
	press(card(0), "ArrowLeft");
	await tick();
	expect(onchange).not.toHaveBeenCalled();
});

it("保存中は動かせない", async () => {
	const { card, onchange } = render(true);
	await tick();
	press(card(0), "ArrowRight");
	press(card(0), "Delete");
	await tick();
	expect(onchange).not.toHaveBeenCalled();
});

it("ティア表は ↑↓ で段を移り、←→ は同じ段の中だけで動かす", async () => {
	const tiered = [
		{ id: 1, title: "一", cover_url: null, tier: 0 },
		{ id: 2, title: "二", cover_url: null, tier: 1 },
		{ id: 3, title: "三", cover_url: null, tier: 1 },
	];
	const { card, onchange } = render(false, ["S", "A"], tiered);
	await tick();
	// 段をまたいで横には動かさない
	press(card(0), "ArrowRight");
	await tick();
	expect(onchange).not.toHaveBeenCalled();
	// S の作品を A へ下げると、A の最後に入る
	press(card(0), "ArrowDown");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 3, 1], [1, 1, 1]);
	// さらに下げると未分類
	press(document.activeElement as HTMLElement, "ArrowDown");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 3, 1], [1, 1, null]);
	// A の中で左へ
	press(card(1), "ArrowLeft");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([3, 2, 1], [1, 1, null]);
});
