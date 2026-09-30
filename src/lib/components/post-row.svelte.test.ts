import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTimelinePosts } from "./fixtures/timeline";
import LiveRoomPostCard from "./LiveRoomPostCard.svelte";
import PostComposer from "./PostComposer.svelte";
import PostDetail from "./PostDetail.svelte";
import PostRow from "./PostRow.svelte";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/") } }));

function fixturePost(index: number) {
	const post = makeTimelinePosts()[index];
	if (!post) throw new Error("Missing fixture post");
	return post;
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0)) await dispose();
	document.body.innerHTML = "";
});

describe("shared reaction rows", () => {
	it("reveals secondary actions by button and closes them with Escape", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostRow, {
			target,
			props: { post: fixturePost(0), currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		expect(target.querySelector('[aria-label="返信"]')).toBeNull();
		expect(target.querySelector(".post-inline-context")?.textContent).toContain("星をめぐる旅");
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の操作"]')?.click();
		await tick();
		expect(target.querySelector('[aria-label="返信"]')).not.toBeNull();
		expect(target.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-08T12:00:00.000Z");
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await tick();
		expect(target.querySelector('[aria-label="返信"]')).toBeNull();
	});
	it("puts the author on the first line and the like beside the text", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostRow, { target, props: { post: fixturePost(0) } });
		cleanup.push(() => unmount(component));
		await tick();
		expect(target.querySelector(".post-row-head .post-row-name")).not.toBeNull();
		expect(target.querySelector(".post-row-main .post-content")).not.toBeNull();
		expect(target.querySelector('.post-row-main [aria-label="いいね"]')).not.toBeNull();
	});
	it("shows every reaction in the detail footer without timeline row chrome", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostDetail, {
			target,
			props: { post: fixturePost(0), currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		expect(target.querySelector(".post-row")).toBeNull();
		for (const label of ["返信", "リポスト", "いいね", "ブックマーク"]) {
			expect(target.querySelector(`.post-footer [aria-label="${label}"]`)).not.toBeNull();
		}
		expect(target.querySelector(".post-display-name")?.textContent).toContain("@");
	});
	it("keeps images and per-post likes in the room while suppressing repeated anime context", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, {
			target,
			props: { post: fixturePost(18), currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		expect(target.querySelector(".post-inline-context")).toBeNull();
		expect(target.querySelector(".post-image")?.getAttribute("width")).toBe("480");
		expect(target.querySelector('[aria-label="いいね"]')).not.toBeNull();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]')?.click();
		await tick();
		expect(target.querySelector(".post-footer")).not.toBeNull();
	});
	it("protects spoiler text until explicitly revealed in the room", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, { target, props: { post: fixturePost(22) } });
		cleanup.push(() => unmount(component));
		await tick();
		expect(target.querySelector(".post-cw-content")?.getAttribute("aria-hidden")).toBe("true");
		target.querySelector<HTMLButtonElement>(".post-cw-banner")?.click();
		await tick();
		expect(target.querySelector(".post-content")?.textContent).toContain("音楽も最高");
	});
	it("closes the quote modal on a backdrop click without opening the post", async () => {
		const { goto } = await import("$app/navigation");
		vi.mocked(goto).mockClear();
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostRow, {
			target,
			props: { post: fixturePost(0), currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の操作"]')?.click();
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="リポスト"]')?.click();
		await tick();
		target.querySelector<HTMLButtonElement>(".repost-menu-item-quote")?.click();
		await tick();
		const overlay = target.querySelector<HTMLElement>(".quote-modal-overlay");
		if (!overlay) throw new Error("Missing quote modal");
		overlay.click();
		await tick();
		expect(target.querySelector(".quote-modal-overlay")).toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});
	it("starts the composer on one line with its tools visible and a counter near the limit", async () => {
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostComposer, { target, props: { username: "viewer", avatarUrl: null } });
		cleanup.push(() => unmount(component));
		await tick();
		const textarea = target.querySelector("textarea");
		if (!textarea) throw new Error("Missing composer textarea");
		expect(textarea.getAttribute("rows")).toBe("1");
		expect(target.querySelector(".char-count")).toBeNull();
		// d42d1e2 で添付・引用・CW・ルームの道具は「+」メニューをやめて常時表示になった
		expect(target.querySelector('[aria-label="画像を添付"]')).not.toBeNull();
		expect(target.querySelector('[aria-label="画像・作品などを追加"]')).toBeNull();
		textarea.value = "あ".repeat(250);
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();
		expect(target.querySelector(".char-count")?.textContent).toBe("30");
	});
});
