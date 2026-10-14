import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import UserAvatar from "./UserAvatar.svelte";

function render(src: string | null) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(UserAvatar, { target, props: { src, username: "animetaro" } });
	flushSync();
	return {
		target,
		cleanup: async () => {
			await unmount(component);
			target.remove();
		},
	};
}

describe("UserAvatar", () => {
	it("画像があれば img を出す", async () => {
		const { target, cleanup } = render("data:image/gif;base64,R0lGODlhAQABAAAAACw=");
		expect(target.querySelector("img")).not.toBeNull();
		await cleanup();
	});

	it("画像が無ければ頭文字を出す", async () => {
		const { target, cleanup } = render(null);
		expect(target.querySelector("img")).toBeNull();
		expect(target.textContent?.trim()).toBe("A");
		await cleanup();
	});

	it("読み込みに失敗したら頭文字に切り替える（CSP で拒否された外部画像など）", async () => {
		const { target, cleanup } = render("https://cdn.discordapp.com/avatars/1/broken.png");
		const img = target.querySelector("img");
		img?.dispatchEvent(new Event("error"));
		flushSync();
		expect(target.querySelector("img")).toBeNull();
		expect(target.textContent?.trim()).toBe("A");
		await cleanup();
	});
});
