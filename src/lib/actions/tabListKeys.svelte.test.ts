import { afterEach, describe, expect, it } from "vitest";
import { tabListKeys } from "./tabListKeys";

function makeTabs() {
	const list = document.body.appendChild(document.createElement("div"));
	list.setAttribute("role", "tablist");
	list.innerHTML = `
		<button type="button" role="tab">ルーム</button>
		<button type="button" role="tab">イベント</button>
		<button type="button" role="tab" disabled>管理</button>
		<button type="button" role="tab">ログ</button>
	`;
	const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
	const clicked: string[] = [];
	for (const tab of tabs) tab.addEventListener("click", () => clicked.push(tab.textContent ?? ""));
	return { list, tabs, clicked };
}

const press = (el: Element | undefined, key: string) =>
	el?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

describe("tabListKeys", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("左右の矢印で隣のタブへ移って押し、端では反対の端へ回る。押せないタブは飛ばす", () => {
		const { list, tabs, clicked } = makeTabs();
		const detach = tabListKeys(list);

		press(tabs[0], "ArrowRight");
		expect(document.activeElement).toBe(tabs[1]);
		press(tabs[1], "ArrowRight");
		expect(document.activeElement).toBe(tabs[3]);
		press(tabs[3], "ArrowRight");
		expect(document.activeElement).toBe(tabs[0]);
		press(tabs[0], "ArrowLeft");
		expect(document.activeElement).toBe(tabs[3]);
		expect(clicked).toEqual(["イベント", "ログ", "ルーム", "ログ"]);

		detach?.();
	});

	it("Home と End で端のタブへ移り、ほかのキーには何もしない", () => {
		const { list, tabs, clicked } = makeTabs();
		const detach = tabListKeys(list);

		press(tabs[1], "End");
		expect(document.activeElement).toBe(tabs[3]);
		press(tabs[3], "Home");
		expect(document.activeElement).toBe(tabs[0]);
		expect(press(tabs[0], "Enter")).toBe(true);
		expect(clicked).toEqual(["ログ", "ルーム"]);

		detach?.();
	});
});
