import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Anime, AnimeStatus } from "$lib/types";
import AnimeProgressRow from "./AnimeProgressRow.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

const statusLabel: Record<AnimeStatus, string> = {
	watching: "視聴中",
	completed: "完了",
	plan_to_watch: "視聴予定",
	on_hold: "中断",
	dropped: "断念",
};

function renderRow(status: AnimeStatus = "plan_to_watch", progress = 0) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const onAutoSave = vi.fn();
	const component = mount(AnimeProgressRow, {
		target,
		props: {
			anime: {
				id: "1",
				title: "テスト",
				episode_count: "12",
				cover_url: null,
				type: "TV",
				season: "2026-fall",
			} as Anime,
			entry: { status, score: "", progress },
			statusLabel,
			onAutoSave,
			onRetry: () => {},
			onOpenDetail: () => {},
		},
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return { target, onAutoSave };
}

function openInput(target: HTMLElement) {
	target.querySelector<HTMLButtonElement>(".progress-edit")?.click();
	flushSync();
	const input = target.querySelector<HTMLInputElement>(".progress-input");
	if (!input) throw new Error("入力欄が開いていない");
	return input;
}

function press(input: HTMLInputElement, key: string) {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	input.dispatchEvent(event);
	flushSync();
	return event;
}

describe("AnimeProgressRow の話数の入力", () => {
	it("Enter で確定し、話数に合わせてステータスも変える", () => {
		const { target, onAutoSave } = renderRow();
		const input = openInput(target);
		input.value = "8";

		press(input, "Enter");
		expect(onAutoSave).toHaveBeenCalledWith({ progress: 8, status: "watching" });
		expect(target.querySelector(".progress-input")).toBeNull();
	});

	it("Enter を止める（止めないと、フォーカスが戻った数字のボタンを押して入力欄がまた開く）", () => {
		const { target } = renderRow();
		const input = openInput(target);
		input.value = "8";

		expect(press(input, "Enter").defaultPrevented).toBe(true);
	});

	it("Esc と空の入力では変えない", () => {
		const { target, onAutoSave } = renderRow("watching", 3);
		const typed = openInput(target);
		typed.value = "8";
		press(typed, "Escape");

		const empty = openInput(target);
		empty.value = "";
		press(empty, "Enter");

		expect(onAutoSave).not.toHaveBeenCalled();
	});

	it("入力欄から離れると確定する", () => {
		const { target, onAutoSave } = renderRow("watching", 3);
		const input = openInput(target);
		input.value = "99";

		input.dispatchEvent(new FocusEvent("blur"));
		flushSync();
		expect(onAutoSave).toHaveBeenCalledWith({ progress: 12, status: "completed" });
	});
});
