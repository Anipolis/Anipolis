import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

import type { UserAnimeEntry } from "$lib/types";
import MyListModal from "./MyListModal.svelte";
import Harness from "./mylist-modal.harness.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function entry(overrides: Partial<UserAnimeEntry> = {}): UserAnimeEntry {
	return {
		status: "watching",
		score: 8,
		progress: 3,
		updated_at: "2026-10-01T00:00:00Z",
		...overrides,
	} as UserAnimeEntry;
}

function renderModal(props: { open: boolean; entry?: UserAnimeEntry | null; removeAction?: string }) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(MyListModal, {
		target,
		props: { animeId: 1, animeTitle: "テスト", episodeCount: "12", onclose: () => {}, ...props },
	});
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

function pressedStatus(target: HTMLElement) {
	return target
		.querySelector<HTMLButtonElement>(".status-grid button[aria-pressed='true']")
		?.getAttribute("data-status");
}

describe("MyListModal の初期表示", () => {
	it("最初の描画から登録済みステータスを選択状態にする(視聴予定を経由しない)", () => {
		// mount 直後・effect 実行前の DOM がブラウザの最初のフレームに相当する
		const target = renderModal({ open: true, entry: entry() });
		expect(pressedStatus(target)).toBe("watching");
		expect(target.querySelector<HTMLInputElement>("input[name='status']")?.value).toBe("watching");
		expect(target.querySelector<HTMLInputElement>("input[name='progress']")?.value).toBe("3");
		expect(target.querySelector<HTMLInputElement>("input[name='score']")?.value).toBe("8");
	});

	it("未登録ならどのステータスも選ばず、選ぶまで保存できない", () => {
		const target = renderModal({ open: true, entry: null });
		const save = () => target.querySelector<HTMLButtonElement>("button.save-button");
		expect(pressedStatus(target)).toBeUndefined();
		expect(target.querySelector<HTMLInputElement>("input[name='status']")?.value).toBe("");
		expect(save()?.disabled).toBe(true);
		expect(target.querySelector(".status-hint")?.textContent).toBe("視聴ステータスを選んでください");

		target.querySelector<HTMLButtonElement>(".status-grid button[data-status='plan_to_watch']")?.click();
		flushSync();
		expect(pressedStatus(target)).toBe("plan_to_watch");
		expect(save()?.disabled).toBe(false);
		expect(target.querySelector(".status-hint")).toBeNull();
	});

	it("開いている間は選び直したステータスを登録内容で上書きしない", () => {
		const target = renderModal({ open: true, entry: entry() });
		flushSync();
		target.querySelector<HTMLButtonElement>(".status-grid button[data-status='completed']")?.click();
		flushSync();
		expect(pressedStatus(target)).toBe("completed");
	});
});

describe("MyListModal の「マイリストから外す」", () => {
	const openWithRemove = () => {
		const target = renderModal({ open: true, entry: entry(), removeAction: "?/removeWatchlist" });
		flushSync();
		return target;
	};
	const removeSubmit = (target: HTMLElement) => target.querySelector<HTMLButtonElement>("button[data-remove]");

	const firstSubmit = (target: HTMLElement) => target.querySelector("form button[type='submit']");

	it("ゴミ箱を押してもすぐには外さず、確認のポップアップを出す", () => {
		const target = openWithRemove();
		expect(removeSubmit(target)).toBeNull();
		expect(target.querySelector("[role='alertdialog']")).toBeNull();

		target.querySelector<HTMLButtonElement>(".remove-button")?.click();
		flushSync();
		expect(removeSubmit(target)?.getAttribute("formaction")).toBe("?/removeWatchlist");
		expect(target.querySelector("[role='alertdialog']")?.textContent).toContain("メモ");
	});

	it("入力欄の Enter で押される先頭の送信ボタンは、確認中も「保存する」", () => {
		const target = openWithRemove();
		expect(firstSubmit(target)?.classList.contains("save-button")).toBe(true);

		target.querySelector<HTMLButtonElement>(".remove-button")?.click();
		flushSync();
		expect(firstSubmit(target)?.classList.contains("save-button")).toBe(true);
	});

	it("ゴミ箱は登録済みの作品にだけ出し、開いたときの最初のフォーカスにしない", () => {
		const target = renderModal({ open: true, entry: null, removeAction: "?/removeWatchlist" });
		flushSync();
		expect(target.querySelector(".remove-button")).toBeNull();

		const registered = openWithRemove();
		const buttons = registered.querySelectorAll("[role='dialog'] button");
		expect(buttons[buttons.length - 1]?.classList.contains("remove-button")).toBe(true);
	});

	it("キャンセルすると確認を閉じ、Esc でも確認だけを閉じる", () => {
		const onclose = vi.fn();
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(MyListModal, {
			target,
			props: {
				open: true,
				animeId: 1,
				animeTitle: "テスト",
				episodeCount: "12",
				entry: entry(),
				removeAction: "?/removeWatchlist",
				onclose,
			},
		});
		cleanup = async () => {
			await unmount(component);
			target.remove();
		};
		flushSync();
		const openConfirm = () => {
			target.querySelector<HTMLButtonElement>(".remove-button")?.click();
			flushSync();
			expect(target.querySelector("[role='alertdialog']")).not.toBeNull();
		};

		openConfirm();
		target.querySelector<HTMLButtonElement>(".confirm-cancel")?.click();
		flushSync();
		expect(target.querySelector("[role='alertdialog']")).toBeNull();

		openConfirm();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		flushSync();
		expect(target.querySelector("[role='alertdialog']")).toBeNull();
		expect(onclose).not.toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});

describe("MyListModal の開閉", () => {
	it("開いてキャンセルを繰り返しても毎回閉じられる", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(Harness, { target, props: { entry: entry() } });
		cleanup = async () => {
			await unmount(component);
			target.remove();
		};
		flushSync();

		for (let round = 1; round <= 3; round++) {
			target.querySelector<HTMLButtonElement>(".open-modal")?.click();
			flushSync();
			expect(target.querySelector("[role='dialog']"), `${round}回目に開く`).not.toBeNull();
			expect(pressedStatus(target)).toBe("watching");

			target.querySelector<HTMLButtonElement>(".cancel-button")?.click();
			flushSync();
			expect(target.querySelector("[role='dialog']"), `${round}回目に閉じる`).toBeNull();
		}
	});
});
