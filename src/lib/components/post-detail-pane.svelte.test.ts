import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import type { Post } from "$lib/types";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), replaceState: vi.fn(), invalidateAll: vi.fn() }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/"), params: {}, state: {}, data: {} } }));

import PostDetailPane from "./PostDetailPane.svelte";
import PostRow from "./PostRow.svelte";

function fixture(index: number): Post {
	const post = makeTimelinePosts()[index];
	if (!post) throw new Error("Missing fixture post");
	return post;
}

async function settle() {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	flushSync();
}

const cleanup: (() => Promise<void>)[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(async () => {
	for (const dispose of cleanup.splice(0)) await dispose();
	document.body.innerHTML = "";
});

describe("タイムライン上の投稿詳細", () => {
	it("本文は持っている投稿をそのまま出し、取りに行くのは返信だけ", async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ replies: [fixture(1)], nextCursor: null, hasMore: false })),
		);
		const post = fixture(0);
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostDetailPane, {
			target,
			props: { post, currentUserId: "me", profile: null, hasSession: false, onback: () => {} },
		});
		cleanup.push(() => unmount(component));

		// 返信が届く前から本文が出ている
		expect(target.querySelector(".thread-main .post-detail")).not.toBeNull();
		await settle();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = String(fetchMock.mock.calls[0]?.[0]);
		expect(url).toContain(`/api/posts/${post.id}/replies`);
		expect(url).toContain("mode=all");
		expect(target.querySelectorAll(".replies-section .post-row")).toHaveLength(1);
	});

	it("返信の取得に失敗したら、本文を残したまま読み込み直しを出す", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostDetailPane, {
			target,
			props: { post: fixture(0), currentUserId: null, profile: null, hasSession: false, onback: () => {} },
		});
		cleanup.push(() => unmount(component));
		await settle();

		expect(target.querySelector(".thread-main")).not.toBeNull();
		expect(target.querySelector("[role=alert]")?.textContent).toContain("返信を読み込めませんでした");
	});
});

describe("PostRow の onOpen", () => {
	it("行を押すとページ遷移の代わりに onOpen へ投稿を渡す", async () => {
		const { goto } = await import("$app/navigation");
		const onOpen = vi.fn();
		const post = $state(fixture(0));
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostRow, { target, props: { post, currentUserId: null, onOpen } });
		cleanup.push(() => unmount(component));

		const link = target.querySelector<HTMLAnchorElement>("a.post-row-hitarea");
		link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ id: post.id });
		expect(goto).not.toHaveBeenCalled();

		// 履歴に保存できる形で渡す（$state のプロキシのままだと pushState が失敗して、詳細が開けなくなる）
		expect(() => structuredClone(onOpen.mock.calls[0]?.[0])).not.toThrow();

		// 新しいタブに開く操作は通常のリンクのまま
		link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
