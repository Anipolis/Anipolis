import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeContextKey, composeDraftKey } from "$lib/compose-draft";
import PostComposer from "./PostComposer.svelte";

// happy-dom の複製フォームは method を "post" と報告しないため use:enhance が開発時チェックで投げる。
// フォーム送信はこのテストの対象外なので no-op に差し替える。
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));

const users = [
	{ id: "u1", username: "alice", display_name: "Alice", avatar_url: null },
	{ id: "u2", username: "alicia", display_name: null, avatar_url: null },
];

function mountComposer(extra: Record<string, unknown> = {}) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(PostComposer, {
		target,
		props: { username: "me", avatarUrl: null, ...extra },
	});
	// Svelte 5 の mount は effect（bind:this や onMount）をマイクロタスクに回すので、操作前に流しておく
	flushSync();
	const textarea = target.querySelector<HTMLTextAreaElement>("textarea[name=content]");
	if (!textarea) throw new Error("textarea was not rendered");
	return {
		target,
		textarea,
		async cleanup() {
			await unmount(component);
			target.remove();
		},
	};
}

/** `@ali` と打って候補が開くところまで進める */
async function openMentions(textarea: HTMLTextAreaElement) {
	textarea.value = "hi @ali";
	textarea.setSelectionRange(7, 7);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	await vi.advanceTimersByTimeAsync(250);
	await tick();
}

function keydown(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
	el.dispatchEvent(event);
	return event;
}

describe("PostComposer mention candidates", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, json: async () => users })),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("@ を消した後に届いた古い応答で、閉じた候補を開き直さない（#329）", async () => {
		// 応答を手で返せるようにして、@ を消した後に届く状況を作る
		let respond: (value: unknown) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise((resolve) => {
						respond = resolve;
					}),
			),
		);
		const { target, textarea, cleanup } = mountComposer();
		textarea.value = "hi @ali";
		textarea.setSelectionRange(7, 7);
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(250); // 検索を送った（応答はまだ）

		textarea.value = "hi ";
		textarea.setSelectionRange(3, 3);
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		respond({ ok: true, json: async () => users });
		await vi.advanceTimersByTimeAsync(50);
		await tick();

		expect(target.querySelector('[role="listbox"]')).toBeNull();
		await cleanup();
	});

	it("exposes the candidates as a listbox tied to the textarea", async () => {
		const { target, textarea, cleanup } = mountComposer();
		await openMentions(textarea);

		const listbox = target.querySelector<HTMLElement>("[role=listbox]");
		const options = target.querySelectorAll<HTMLElement>("[role=option]");
		expect(listbox).not.toBeNull();
		expect(options).toHaveLength(2);
		expect(textarea.getAttribute("aria-controls")).toBe(listbox?.id);
		expect(textarea.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
		expect(options[0]?.getAttribute("aria-selected")).toBe("true");
		expect(options[1]?.getAttribute("aria-selected")).toBe("false");

		await cleanup();
	});

	it("moves with the arrow keys and confirms with Enter while keeping the textarea focused", async () => {
		const { target, textarea, cleanup } = mountComposer();
		textarea.focus();
		await openMentions(textarea);

		keydown(textarea, "ArrowDown");
		flushSync();
		const options = target.querySelectorAll<HTMLElement>("[role=option]");
		expect(textarea.getAttribute("aria-activedescendant")).toBe(options[1]?.id);

		const enter = keydown(textarea, "Enter");
		flushSync();
		expect(enter.defaultPrevented).toBe(true);
		expect(textarea.value).toBe("hi @alicia ");
		expect(target.querySelector("[role=listbox]")).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(document.activeElement).toBe(textarea);

		await cleanup();
	});

	it("confirms with Tab and with a click", async () => {
		const { target, textarea, cleanup } = mountComposer();
		await openMentions(textarea);

		keydown(textarea, "Tab");
		flushSync();
		expect(textarea.value).toBe("hi @alice ");

		await openMentions(textarea);
		target.querySelectorAll<HTMLElement>("[role=option]")[1]?.click();
		flushSync();
		expect(textarea.value).toBe("hi @alicia ");

		await cleanup();
	});

	it("closes with Escape without letting the key reach an enclosing dialog", async () => {
		const { target, textarea, cleanup } = mountComposer();
		const outer = vi.fn();
		document.body.addEventListener("keydown", outer);
		await openMentions(textarea);

		keydown(textarea, "Escape");
		flushSync();
		expect(target.querySelector("[role=listbox]")).toBeNull();
		expect(textarea.value).toBe("hi @ali");
		expect(outer).not.toHaveBeenCalled();

		document.body.removeEventListener("keydown", outer);
		await cleanup();
	});

	it("does not confirm a candidate while an IME composition is active", async () => {
		const { target, textarea, cleanup } = mountComposer();
		await openMentions(textarea);

		const enter = keydown(textarea, "Enter", { isComposing: true });
		flushSync();
		expect(enter.defaultPrevented).toBe(false);
		expect(textarea.value).toBe("hi @ali");
		expect(target.querySelector("[role=listbox]")).not.toBeNull();

		await cleanup();
	});
});

describe("PostComposer draft persistence", () => {
	const key = composeDraftKey("user-1");

	afterEach(() => {
		localStorage.clear();
	});

	it("restores a stored draft on mount and offers an explicit discard", async () => {
		localStorage.setItem(
			key,
			JSON.stringify({
				v: 1,
				savedAt: Date.now(),
				content: "書きかけ",
				imageUrls: [],
				anime: null,
				cwAnime: { id: "a1", title: "葬送のフリーレン", title_en: null, cover_url: null },
				room: null,
			}),
		);
		const { target, textarea, cleanup } = mountComposer({ draftKey: "user-1" });
		await tick();

		expect(textarea.value).toBe("書きかけ");
		expect(target.textContent).toContain("ネタバレ: 葬送のフリーレン");

		const discard = Array.from(target.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("下書きを破棄"),
		);
		expect(discard).toBeDefined();
		discard?.click();
		flushSync();
		expect(textarea.value).toBe("");
		expect(localStorage.getItem(key)).toBeNull();

		await cleanup();
	});

	it("saves typed content under the user's key and drops it once the form is empty", async () => {
		const { textarea, cleanup } = mountComposer({ draftKey: "user-1" });
		await tick();

		textarea.value = "途中まで";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();
		expect(JSON.parse(localStorage.getItem(key) ?? "{}").content).toBe("途中まで");
		expect(localStorage.getItem(composeDraftKey("user-2"))).toBeNull();

		textarea.value = "";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();
		expect(localStorage.getItem(key)).toBeNull();

		await cleanup();
	});

	it("スマホで開き直したとき、直前の投稿の CW と受付中のルームを戻す（#331）", async () => {
		const room = {
			id: "r1",
			anime_id: "a1",
			room_date: "2026-10-13",
			room_kind: "episode",
			room_key: "a1:2026-10-13",
			scheduled_at: "2026-10-13T12:00:00Z",
			anime: { id: "a1", title: "葬送のフリーレン", cover_url: null },
		};
		localStorage.setItem(
			composeContextKey("user-1"),
			JSON.stringify({
				v: 1,
				savedAt: Date.now(),
				cwAnime: { id: "a1", title: "葬送のフリーレン", title_en: null, cover_url: null },
				room,
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, json: async () => [room] })),
		);
		const { target, cleanup } = mountComposer({ draftKey: "user-1" });
		await vi.waitFor(() => expect(target.textContent).toContain("ネタバレ: 葬送のフリーレン"));
		await vi.waitFor(() => expect(target.querySelector('input[name="broadcast_room_session_id"]')).not.toBeNull());
		vi.unstubAllGlobals();
		await cleanup();
	});

	it("受付が終わったルームは戻さない（#331）", async () => {
		localStorage.setItem(
			composeContextKey("user-1"),
			JSON.stringify({ v: 1, savedAt: Date.now(), cwAnime: null, room: { id: "closed", anime_id: "a1" } }),
		);
		const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
		vi.stubGlobal("fetch", fetchMock);
		const { target, cleanup } = mountComposer({ draftKey: "user-1" });
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/rooms/open"));
		await tick();
		expect(target.querySelector('input[name="broadcast_room_session_id"]')).toBeNull();
		vi.unstubAllGlobals();
		await cleanup();
	});

	it("外した画像と、破棄した下書きの画像を Storage から消すよう依頼する（#330）", async () => {
		const urls = [
			"https://project.supabase.co/storage/v1/object/public/post-images/user-1/1-a.png",
			"https://project.supabase.co/storage/v1/object/public/post-images/user-1/2-b.png",
			"https://project.supabase.co/storage/v1/object/public/post-images/user-1/3-c.png",
		];
		localStorage.setItem(
			key,
			JSON.stringify({
				v: 1,
				savedAt: Date.now(),
				content: "画像つき",
				imageUrls: urls,
				anime: null,
				cwAnime: null,
				room: null,
			}),
		);
		const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => ({
			ok: true,
			json: async () => ({ removed: true }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const { target, cleanup } = mountComposer({ draftKey: "user-1" });
		await tick();

		target.querySelector<HTMLButtonElement>('[aria-label="画像を削除"]')?.click();
		flushSync();
		const deletedUrls = () =>
			fetchMock.mock.calls
				.filter(([, init]) => init?.method === "DELETE")
				.map(([, init]) => JSON.parse(String(init?.body)).url);
		expect(deletedUrls()).toEqual([urls[0]]);

		Array.from(target.querySelectorAll("button"))
			.find((b) => b.textContent?.includes("下書きを破棄"))
			?.click();
		flushSync();
		expect(deletedUrls()).toEqual(urls);

		vi.unstubAllGlobals();
		await cleanup();
	});

	it("does not touch storage without a draftKey", async () => {
		const { textarea, cleanup } = mountComposer();
		await tick();
		textarea.value = "保存されない";
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		flushSync();
		expect(localStorage.length).toBe(0);
		await cleanup();
	});
});
