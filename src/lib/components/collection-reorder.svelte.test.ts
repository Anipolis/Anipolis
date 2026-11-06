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

function render() {
	const onsave = vi.fn(async (_ids: number[]) => {});
	const oncancel = vi.fn();
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(CollectionReorder, { target, props: { items, onsave, oncancel } });
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	const card = (index: number) => target.querySelector<HTMLElement>(`[data-reorder-index="${index}"]`);
	const saveButton = () =>
		[...target.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("保存"));
	return { target, onsave, oncancel, card, saveButton };
}

const press = (el: HTMLElement | null, key: string) =>
	el?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

it("変えるまでは保存できない", async () => {
	const { saveButton } = render();
	await tick();
	expect(saveButton()?.disabled).toBe(true);
});

it("矢印キーで動かし、Delete で外して、その並びで保存する", async () => {
	const { card, onsave, saveButton } = render();
	await tick();
	press(card(0), "ArrowRight");
	await tick();
	// 動かした作品にキーボードの位置が付いていく
	expect(document.activeElement).toBe(card(1));
	press(card(2), "Delete");
	await tick();
	saveButton()?.click();
	await tick();
	expect(onsave).toHaveBeenCalledWith([2, 1]);
});

it("保存に失敗したら、その文を出して並べ替えを続けられる", async () => {
	const { target, card, onsave, saveButton } = render();
	onsave.mockRejectedValueOnce(new Error("保存できませんでした"));
	await tick();
	press(card(0), "Delete");
	await tick();
	saveButton()?.click();
	await vi.waitFor(() =>
		expect(target.querySelector('[role="alert"]')?.textContent).toContain("保存できませんでした"),
	);
	expect(saveButton()?.disabled).toBe(false);
});
