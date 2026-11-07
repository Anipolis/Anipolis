import { mount, tick, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import CollectionBoard from "./CollectionBoard.svelte";

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

function render(tiers?: string[], list: Item[] = items) {
	const onchange = vi.fn((_ids: number[], _tiers: (number | null)[]) => {});
	const ontierschange = vi.fn((_tiers: string[], _origins: (number | null)[]) => {});
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(CollectionBoard, { target, props: { items: list, onchange, ontierschange, tiers } });
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	const card = (index: number) => target.querySelector<HTMLElement>(`[data-board-index="${index}"]`);
	return { target, onchange, ontierschange, card };
}

const press = (el: HTMLElement | null, key: string) =>
	el?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const click = (el: Element | null | undefined) => el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const tieredItems: Item[] = [
	{ id: 1, title: "一", cover_url: null, tier: 0 },
	{ id: 2, title: "二", cover_url: null, tier: 1 },
	{ id: 3, title: "三", cover_url: null, tier: 1 },
];

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

it("作品を押して選び、別の作品を押すとその位置へ移す", async () => {
	const { card, onchange } = render();
	await tick();
	click(card(0));
	await tick();
	expect(card(0)?.getAttribute("aria-pressed")).toBe("true");
	click(card(2));
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 3, 1], [null, null, null]);
	// 移したら選んでいない状態に戻る
	expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
});

it("選んだ作品は、外すボタンで外せる", async () => {
	const { target, card, onchange } = render();
	await tick();
	click(card(1));
	await tick();
	click(target.querySelector('[aria-label="「二」を外す"]'));
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([1, 3], [null, null]);
});

it("ティア表は ↑↓ で段を移り、←→ は同じ段の中だけで動かす", async () => {
	const { card, onchange } = render(["S", "A"], tieredItems);
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

it("ティア表は、選んだ作品を段や未分類の空いたところを押すとその最後へ移す", async () => {
	const { target, card, onchange } = render(["S", "A"], tieredItems);
	await tick();
	click(card(1));
	await tick();
	click(target.querySelector('[data-board-tier="0"]'));
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([1, 2, 3], [0, 0, 1]);
	click(card(0));
	await tick();
	click(target.querySelector('[data-board-tier="none"]'));
	await tick();
	expect(onchange).toHaveBeenLastCalledWith([2, 3, 1], [0, 1, null]);
});

it("段の名前をその場で直すと、段の並びはそのままで知らせる", async () => {
	const { target, ontierschange, onchange } = render(["S", "A"], tieredItems);
	await tick();
	click(target.querySelector('button[title="名前を変える"]'));
	await tick();
	const input = target.querySelector<HTMLInputElement>(".board-tier-input");
	expect(input).not.toBeNull();
	if (!input) return;
	input.value = "神";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	press(input, "Enter");
	await tick();
	expect(ontierschange).toHaveBeenLastCalledWith(["神", "A"], [0, 1], [1, 2, 3], [0, 1, 1]);
	expect(onchange).not.toHaveBeenCalled();
});

it("段を消すと、残る段の番号を付け替え、消した段の作品を未分類へ移す", async () => {
	const { target, ontierschange } = render(
		["S", "A", "B"],
		[
			{ id: 1, title: "一", cover_url: null, tier: 0 },
			{ id: 2, title: "二", cover_url: null, tier: 1 },
			{ id: 3, title: "三", cover_url: null, tier: 2 },
		],
	);
	await tick();
	click(target.querySelector('[aria-label="段「A」のメニュー"]'));
	await tick();
	click([...target.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes("この段を消す")));
	await tick();
	expect(ontierschange).toHaveBeenLastCalledWith(["S", "B"], [0, 2], [1, 3, 2], [0, 1, null]);
	// 旧 A の作品は未分類、旧 B の作品は新しい B（1番）のまま
	expect(target.querySelector('[data-board-tier="none"] [data-board-id="2"]')).not.toBeNull();
	expect(target.querySelector('[data-board-tier="1"] [data-board-id="3"]')).not.toBeNull();
});
