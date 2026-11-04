import { flushSync, mount, tick, unmount } from "svelte";
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

function inputOf(target: HTMLElement) {
	const input = target.querySelector<HTMLInputElement>(".progress-input");
	if (!input) throw new Error("入力欄がない");
	input.focus();
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
		const input = inputOf(target);
		input.value = "8";

		press(input, "Enter");
		expect(onAutoSave).toHaveBeenCalledWith({ progress: 8, status: "watching" });
	});

	it("Esc と空の入力では変えず、今の話数を出し直す", async () => {
		const { target, onAutoSave } = renderRow("watching", 3);
		const input = inputOf(target);
		input.value = "8";
		press(input, "Escape");
		await tick();
		expect(input.value).toBe("3");

		input.focus();
		input.value = "";
		press(input, "Enter");
		await tick();
		expect(input.value).toBe("3");

		expect(onAutoSave).not.toHaveBeenCalled();
	});

	it("入力欄から離れると確定し、範囲の外は端の値にする", () => {
		const { target, onAutoSave } = renderRow("watching", 3);
		const input = inputOf(target);
		input.value = "99";

		input.blur();
		flushSync();
		expect(onAutoSave).toHaveBeenCalledWith({ progress: 12, status: "completed" });
	});

	it("確定しても話数が変わらないときは、入力した文字を残さない", async () => {
		const { target, onAutoSave } = renderRow("completed", 12);
		const input = inputOf(target);
		input.value = "99";

		input.blur();
		await tick();
		expect(onAutoSave).not.toHaveBeenCalled();
		expect(input.value).toBe("12");
	});
});
