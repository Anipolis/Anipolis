import type { ActionResult, SubmitFunction } from "@sveltejs/kit";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import { NETWORK_ERROR_MESSAGE } from "$lib/components/post-composer-submit";
import type { Post } from "$lib/types";

// 返信フォームの use:enhance に渡された送信処理を受け取り、送信結果をこのテストから流し込む
const forms = vi.hoisted(() => ({ submit: null as SubmitFunction | null }));
vi.mock("$app/forms", () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		if (form.getAttribute("action") === "?/reply") forms.submit = submit;
		return { destroy() {} };
	},
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), replaceState: vi.fn(), invalidateAll: vi.fn() }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/posts/post-0"), params: { id: "post-0" }, state: {}, data: {} },
}));

import PostDetailPage from "./+page.svelte";

type Thread = { post: Post; parentPost: Post | null; replies: Post[] };

function fixture(index: number): Post {
	const post = makeTimelinePosts()[index];
	if (!post) throw new Error("Missing fixture post");
	return post;
}

function pageData(enrichedData: Promise<Thread>) {
	return {
		post: { content: "本文" },
		enrichedData,
		ogImageUrl: null,
		profile: { id: "me", username: "me", display_name: null, avatar_url: null },
		session: { access_token: "t" },
		currentUserId: "me",
		trending: [],
		animeTrending: [],
	};
}

/** 実際の再取得はストリーミングで保留になるので、解決を外から決められる Promise を使う */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

async function settle() {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	flushSync();
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0)) await dispose();
	document.body.innerHTML = "";
	forms.submit = null;
});

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
});

async function mountPage(first: Thread) {
	const props = $state({ data: pageData(Promise.resolve(first)), form: null });
	const target = document.body.appendChild(document.createElement("div"));
	const component = mount(PostDetailPage, { target, props: props as never });
	cleanup.push(() => unmount(component));
	await settle();
	return { props, target };
}

const replyCount = (target: HTMLElement) => target.querySelectorAll(".replies-section .post-row").length;

describe("投稿詳細（#296）", () => {
	it("返信後の再取得中も、スレッドと返信欄をスケルトンに戻さない", async () => {
		const first = { post: fixture(0), parentPost: null, replies: [fixture(1)] };
		const { props, target } = await mountPage(first);
		expect(target.querySelector(".thread-main")).not.toBeNull();
		expect(replyCount(target)).toBe(1);
		const textarea = target.querySelector<HTMLTextAreaElement>("textarea[name=content]");

		// 返信の送信・削除のあとの invalidate で、遅れて解決する新しい Promise に差し替わる
		const reload = deferred<Thread>();
		props.data = pageData(reload.promise);
		await settle();
		expect(target.querySelector(".posts-loading-spinner")).toBeNull();
		expect(target.querySelector(".thread-main")).not.toBeNull();
		expect(replyCount(target)).toBe(1);
		// 返信欄は作り直されない（入力中の内容やフォーカスが保たれる）
		expect(target.querySelector("textarea[name=content]")).toBe(textarea);

		reload.resolve({ ...first, replies: [fixture(1), fixture(2)] });
		await settle();
		expect(replyCount(target)).toBe(2);
	});

	it("通信エラーでは書きかけの返信を残し、理由を出す（エラーページへ進まない）", async () => {
		const { target } = await mountPage({ post: fixture(0), parentPost: null, replies: [] });
		const textarea = target.querySelector<HTMLTextAreaElement>("textarea[name=content]");
		if (!textarea || !forms.submit) throw new Error("reply form was not rendered");
		textarea.value = "書きかけの返信";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();

		const update = vi.fn(async () => {});
		const finish = await forms.submit({} as never);
		if (typeof finish !== "function") throw new Error("submit handler did not return a callback");
		await finish({ result: { type: "error", error: new Error("offline") } as ActionResult, update } as never);
		flushSync();

		expect(update).not.toHaveBeenCalled();
		expect(textarea.value).toBe("書きかけの返信");
		expect(target.querySelector(".reply-composer [role=alert]")?.textContent).toBe(NETWORK_ERROR_MESSAGE);
	});

	it("サーバーが断った返信も残し、理由を出す", async () => {
		const { target } = await mountPage({ post: fixture(0), parentPost: null, replies: [] });
		const textarea = target.querySelector<HTMLTextAreaElement>("textarea[name=content]");
		if (!textarea || !forms.submit) throw new Error("reply form was not rendered");
		textarea.value = "\u0017";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();

		const update = vi.fn(async () => {});
		const finish = await forms.submit({} as never);
		if (typeof finish !== "function") throw new Error("submit handler did not return a callback");
		const failure = { type: "failure", status: 400, data: { message: "本文に表示できる文字がありません" } };
		await finish({ result: failure as ActionResult, update } as never);
		flushSync();

		expect(update).not.toHaveBeenCalled();
		expect(textarea.value).toBe("\u0017");
		expect(target.querySelector(".reply-composer [role=alert]")?.textContent).toBe(
			"本文に表示できる文字がありません",
		);
	});

	it("返信が成功したら入力を空にして再取得する", async () => {
		const { target } = await mountPage({ post: fixture(0), parentPost: null, replies: [] });
		const textarea = target.querySelector<HTMLTextAreaElement>("textarea[name=content]");
		if (!textarea || !forms.submit) throw new Error("reply form was not rendered");
		textarea.value = "返信です";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();

		const update = vi.fn(async () => {});
		const finish = await forms.submit({} as never);
		if (typeof finish !== "function") throw new Error("submit handler did not return a callback");
		await finish({ result: { type: "success", status: 200 } as ActionResult, update } as never);
		flushSync();

		expect(update).toHaveBeenCalledTimes(1);
		expect(textarea.value).toBe("");
	});

	it("最初の読み込みに失敗したら、空のスレッドではなく再読み込みを出す", async () => {
		const props = $state({ data: pageData(Promise.reject(new Error("db down"))), form: null });
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(PostDetailPage, { target, props: props as never });
		cleanup.push(() => unmount(component));
		await settle();
		expect(target.querySelector("[role=alert]")?.textContent).toContain("投稿を読み込めませんでした");
		expect(target.querySelector(".thread-main")).toBeNull();
	});
});
