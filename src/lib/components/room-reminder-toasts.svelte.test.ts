import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoomReminder } from "$lib/room-reminders";
import RoomReminderToasts from "./RoomReminderToasts.svelte";

function reminder(id: string, firedAt = "2026-11-10T12:00:00Z"): RoomReminder {
	return {
		id,
		fired_at: firedAt,
		title: `番組${id}`,
		cover_url: null,
		href: `/rooms/anime/${id}/2026-11-10`,
		scheduled_at: "2026-11-10T12:30:00Z",
		ends_at: "2026-11-10T13:00:00Z",
		read: false,
	};
}

let cleanup: (() => void) | null = null;
beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup?.();
	cleanup = null;
	vi.useRealTimers();
});

function render() {
	const target = document.body.appendChild(document.createElement("div"));
	const instance = mount(RoomReminderToasts, { target });
	// mount の戻り値は書き出した関数の型を持たないので、使う分だけ型を付ける
	const component = instance as unknown as { notify: (reminders: RoomReminder[]) => void };
	cleanup = () => {
		unmount(instance);
		target.remove();
	};
	const titles = () =>
		[...target.querySelectorAll(".room-reminder-toast-title")].map((element) => element.textContent?.trim());
	return { component, target, titles };
}

it("一度に出すのは3件までで、はみ出した分は前のが消えてから出す", () => {
	const { component, target, titles } = render();
	component.notify([reminder("1"), reminder("2"), reminder("3"), reminder("4")]);
	flushSync();
	expect(titles()).toEqual(["番組1", "番組2", "番組3"]);
	// まだ出していない4件目は、表示済みにしない
	expect(JSON.parse(localStorage.getItem("anipolis:room-reminder-toasts") ?? "[]")).toHaveLength(3);

	target.querySelector<HTMLButtonElement>(".room-reminder-toast-close")?.click();
	flushSync();
	expect(titles()).toEqual(["番組2", "番組3", "番組4"]);
});

it("同じお知らせは二度出さず、次のタイミングで鳴り直したらまた出す", () => {
	const { component, titles } = render();
	component.notify([reminder("1")]);
	flushSync();
	vi.advanceTimersByTime(8_000);
	flushSync();
	expect(titles()).toEqual([]);

	component.notify([reminder("1")]);
	flushSync();
	expect(titles()).toEqual([]);

	component.notify([reminder("1", "2026-11-10T12:25:00Z")]);
	flushSync();
	expect(titles()).toEqual(["番組1"]);
});

it("既読のお知らせは出さない", () => {
	const { component, titles } = render();
	component.notify([{ ...reminder("1"), read: true }]);
	flushSync();
	expect(titles()).toEqual([]);
});
