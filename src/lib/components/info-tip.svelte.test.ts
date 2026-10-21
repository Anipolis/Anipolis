import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import InfoTip from "./InfoTip.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function renderInfoTip(props: { label: string; text: string }) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(InfoTip, { target, props });
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

describe("InfoTip", () => {
	it("ⓘボタンが説明のポップオーバーを開く(読み上げ名は「◯◯の説明」)", () => {
		const target = renderInfoTip({ label: "タグの絞り込み", text: "説明文" });
		const button = target.querySelector("button");
		const popover = target.querySelector("[popover]");

		expect(button?.getAttribute("aria-label")).toBe("タグの絞り込みの説明");
		expect(button?.getAttribute("type")).toBe("button");
		expect(popover?.id).toBeTruthy();
		expect(button?.getAttribute("popovertarget")).toBe(popover?.id);
		expect(popover?.textContent?.trim()).toBe("説明文");
	});

	it("同じ画面に複数置いても、ボタンとポップオーバーの対応が重複しない", () => {
		const first = renderInfoTip({ label: "A", text: "a" });
		const firstCleanup = cleanup;
		const second = renderInfoTip({ label: "B", text: "b" });
		const secondCleanup = cleanup;
		cleanup = async () => {
			await firstCleanup?.();
			await secondCleanup?.();
		};

		const firstId = first.querySelector("[popover]")?.id;
		const secondId = second.querySelector("[popover]")?.id;
		expect(firstId).not.toBe(secondId);
		expect(second.querySelector("button")?.getAttribute("popovertarget")).toBe(secondId);
	});
});
