import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import CollectionReorder from "./CollectionReorder.svelte";

const items = [
	{ id: 1, title: "一", cover_url: null },
	{ id: 2, title: "二", cover_url: null },
	{ id: 3, title: "三", cover_url: null },
];

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function render(disabled = false) {
	const onchange = vi.fn((_ids: number[]) => {});
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(CollectionReorder, { target, props: { items, onchange, disabled } });
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
	expect(onchange).toHaveBeenLastCalledWith([2, 1, 3]);
	// 動かした作品にキーボードの位置が付いていく
	expect(document.activeElement).toBe(card(1));
	press(card(2), "Delete");
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 1]);
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
