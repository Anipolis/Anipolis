import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyListStatusPopover from "./MyListStatusPopover.svelte";

// フォーム送信はこのテストの対象外（happy-dom では use:enhance の開発時チェックが投げる）
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
	document.body.innerHTML = "";
});

function mountPopover(props: Record<string, unknown> = {}) {
	const anchor = document.createElement("button");
	document.body.appendChild(anchor);
	const target = document.createElement("div");
	document.body.appendChild(target);
	const onclose = vi.fn();
	const component = mount(MyListStatusPopover, {
		target,
		props: { anchor, animeId: "42", animeTitle: "テスト作品", onclose, ...props },
	});
	flushSync();
	cleanup = () => unmount(component);
	return { target, anchor, onclose };
}

const hiddenValue = (target: HTMLElement, name: string) =>
	target.querySelector<HTMLInputElement>(`input[type=hidden][name=${name}]`)?.value;

describe("MyListStatusPopover", () => {
	it("状態だけを変えるので、今のスコアと進捗をそのまま送る", () => {
		const { target } = mountPopover({
			entry: { status: "watching", score: 9, progress: 4, updated_at: "2026-10-28T00:00:00Z" },
		});
		expect(hiddenValue(target, "anime_id")).toBe("42");
		expect(hiddenValue(target, "score")).toBe("9");
		expect(hiddenValue(target, "progress")).toBe("4");
		const current = target.querySelector('[aria-current="true"]');
		expect(current?.getAttribute("value")).toBe("watching");
	});

	it("未登録ならスコアは空・進捗は0で、どの状態も選ばれていない", () => {
		const { target } = mountPopover({ entry: null });
		expect(hiddenValue(target, "score")).toBe("");
		expect(hiddenValue(target, "progress")).toBe("0");
		expect(target.querySelector('[aria-current="true"]')).toBeNull();
		const values = [...target.querySelectorAll<HTMLButtonElement>("button[name=status]")].map((b) => b.value);
		expect(values).toEqual(["plan_to_watch", "watching", "completed", "on_hold", "dropped"]);
	});

	it("「マイリストから外す」は登録済みで、外す先が渡されたときだけ出す", () => {
		const entry = { status: "watching", score: null, progress: 0, updated_at: "2026-10-28T00:00:00Z" };
		const removeButton = (target: HTMLElement) => target.querySelector<HTMLButtonElement>("button[data-remove]");

		const listed = mountPopover({ entry, removeAction: "?/removeWatchlist" });
		expect(removeButton(listed.target)?.getAttribute("formaction")).toBe("?/removeWatchlist");
		void cleanup?.();

		expect(removeButton(mountPopover({ entry: null, removeAction: "?/removeWatchlist" }).target)).toBeNull();
		void cleanup?.();

		expect(removeButton(mountPopover({ entry }).target)).toBeNull();
	});

	it("スコアを選ぶ欄は、今の状態と進捗をそのまま送り、外すボタンは出さない", () => {
		const { target } = mountPopover({
			field: "score",
			entry: { status: "completed", score: 7, progress: 12, updated_at: "2026-10-28T00:00:00Z" },
			removeAction: "?/removeWatchlist",
		});
		expect(hiddenValue(target, "status")).toBe("completed");
		expect(hiddenValue(target, "progress")).toBe("12");
		// スコアは押したボタンの値で送る（隠し欄で送ると二重になる）
		expect(target.querySelector("input[type=hidden][name=score]")).toBeNull();
		const values = [...target.querySelectorAll<HTMLButtonElement>("button[name=score]")].map((b) => b.value);
		expect(values).toEqual(["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", ""]);
		expect(target.querySelector('[aria-current="true"]')?.getAttribute("value")).toBe("7");
		expect(target.querySelector("button[data-remove]")).toBeNull();
	});

	it("スコアが無ければ「なし」が選ばれている", () => {
		const { target } = mountPopover({
			field: "score",
			entry: { status: "watching", score: null, progress: 0, updated_at: "2026-10-28T00:00:00Z" },
		});
		expect(target.querySelector('[aria-current="true"]')?.getAttribute("value")).toBe("");
	});

	it("外側を押すと閉じ、ボタン自身を押したときは閉じない（開け閉めはボタン側）", () => {
		const { anchor, onclose } = mountPopover();
		anchor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(onclose).not.toHaveBeenCalled();
		document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it("Esc で閉じてボタンへフォーカスを戻す", () => {
		const { anchor, onclose } = mountPopover();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(document.activeElement).toBe(anchor);
	});
});
