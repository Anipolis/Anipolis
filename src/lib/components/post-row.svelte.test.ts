import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Post } from "#lib/types.ts";
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
		expect(target.querySelector(".anime-quote-card .anime-quote-title")?.textContent).toContain("星をめぐる旅");
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
		// 共通の Modal（<dialog>）では、カードの外（= <dialog> 自身）を押すと閉じる
		const dialog = target.querySelector<HTMLDialogElement>("dialog:has(.quote-modal-card)");
		if (!dialog) throw new Error("Missing quote modal");
		dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		dialog.click();
		await tick();
		expect(target.querySelector(".quote-modal-card")).toBeNull();
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

describe("CW（ネタバレ注意）の保護（#317〜#319）", () => {
	const quoted = {
		id: "quoted-1",
		content: "最終回で主人公が旅を終える",
		user_id: "preview-user-9",
		created_at: "2026-09-08T11:00:00.000Z",
		username: "spoiler_author",
		display_name: null,
		avatar_url: null,
		cw_anime_id: "42",
		cw_anime: { title: "星をめぐる旅" },
		image_urls: ["https://signed.example/spoiler.png"],
		anime_id: null,
		anime: null,
		quoted_post_id: null,
	};

	async function render(component: typeof PostRow | typeof PostDetail, post: ReturnType<typeof fixturePost>) {
		const target = document.body.appendChild(document.createElement("div"));
		const instance = mount(component, { target, props: { post } });
		cleanup.push(() => unmount(instance));
		await tick();
		return target;
	}

	for (const [name, component] of [
		["タイムライン", PostRow],
		["投稿詳細", PostDetail],
	] as const) {
		it(`${name}: 折り畳み中は本文だけでなく画像・引用も隠し、展開すると見せる`, async () => {
			const post = { ...fixturePost(22), image_urls: ["https://example.com/spoiler.png"], quoted_post: null };
			const target = await render(component, post);

			const hidden = target.querySelector(".post-cw-content");
			expect(hidden?.getAttribute("aria-hidden")).toBe("true");
			expect(hidden?.hasAttribute("inert")).toBe(true);
			// 画像は折り畳みの中にある（外に出ていない）
			expect(target.querySelector(".post-cw-content .post-image")).not.toBeNull();
			expect(target.querySelectorAll(".post-image")).toHaveLength(1);

			target.querySelector<HTMLButtonElement>(".post-cw-banner")?.click();
			await tick();
			expect(target.querySelector(".post-cw-content")?.getAttribute("aria-hidden")).toBe("false");
			expect(target.querySelector(".post-cw-content")?.hasAttribute("inert")).toBe(false);
			// 押した文字は消え、隠し直す操作は出さない
			expect(target.querySelector(".post-cw-banner")).toBeNull();
			expect(document.activeElement).toBe(target.querySelector(".post-cw-content-body"));
		});
	}

	it("作品の情報が取れなくても CW の ID があれば折り畳む（通常の本文として出さない）", async () => {
		const post = { ...fixturePost(22), cw_anime: null };
		const target = await render(PostRow, post);
		expect(target.querySelector(".post-cw-banner")?.textContent).toContain("ネタバレを表示");
		expect(target.querySelector(".post-cw-content")?.getAttribute("aria-hidden")).toBe("true");
	});

	it("CW の無い投稿は折り畳まない", async () => {
		const target = await render(PostRow, fixturePost(0));
		expect(target.querySelector(".post-cw-banner")).toBeNull();
		expect(target.querySelector(".post-content")).not.toBeNull();
	});

	it("引用元に CW があれば、引用枠は本文の代わりに警告を出す", async () => {
		const post = { ...fixturePost(0), quoted_post_id: quoted.id, quoted_post: quoted };
		const target = await render(PostRow, post);
		const quote = target.querySelector(".quoted-post");
		expect(quote?.textContent).toContain("『星をめぐる旅』のネタバレを含む投稿");
		expect(quote?.textContent).not.toContain("最終回");
		// 引用元の画像も出さない（#290）
		expect(quote?.querySelector("img.quoted-post-image")).toBeNull();
		// 本文を読むには元の投稿（CW で折り畳まれる）を開く
		expect(quote?.getAttribute("href")).toBe("/posts/quoted-1");
	});

	for (const [name, component] of [
		["タイムライン", PostRow],
		["投稿詳細", PostDetail],
	] as const) {
		it(`${name}: 引用リポストの作成画面でも、CW 付き投稿の本文をプレビューに出さない`, async () => {
			const target = document.body.appendChild(document.createElement("div"));
			const instance = mount(component, {
				target,
				props: { post: fixturePost(22), currentUserId: "preview-user-0" },
			});
			cleanup.push(() => unmount(instance));
			await tick();
			// CW を折り畳んだまま 投稿の操作 → リポスト → 引用リポスト
			target.querySelector<HTMLButtonElement>('[aria-label="投稿の操作"]')?.click();
			await tick();
			target.querySelector<HTMLButtonElement>('[aria-label="リポスト"]')?.click();
			await tick();
			target.querySelector<HTMLButtonElement>(".repost-menu-item-quote")?.click();
			await tick();

			const preview = target.querySelector(".quote-preview-content");
			expect(target.querySelector(".post-cw-content")?.getAttribute("aria-hidden")).toBe("true");
			expect(preview?.textContent).toContain("『星をめぐる旅』のネタバレを含む投稿");
			expect(preview?.textContent).not.toContain("音楽も最高");
		});
	}

	it("引用リポストの作成画面で、画像だけの投稿は縮小画像を出し、押すと拡大できる", async () => {
		const post = {
			...fixturePost(0),
			content: "",
			image_urls: ["https://signed.example/a.png", "https://signed.example/b.png"],
			anime_quote: null,
			quoted_post_id: null,
			quoted_post: null,
		};
		const target = document.body.appendChild(document.createElement("div"));
		const instance = mount(PostRow, { target, props: { post, currentUserId: "preview-user-0" } });
		cleanup.push(() => unmount(instance));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の操作"]')?.click();
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="リポスト"]')?.click();
		await tick();
		target.querySelector<HTMLButtonElement>(".repost-menu-item-quote")?.click();
		await tick();

		const preview = target.querySelector(".quote-preview");
		// 本文が無ければ空の段落は出さず、画像を出す
		expect(preview?.querySelector(".quote-preview-content")).toBeNull();
		const images = preview?.querySelectorAll<HTMLImageElement>("img.quoted-post-image") ?? [];
		expect([...images].map((img) => img.getAttribute("src"))).toEqual([
			"https://signed.example/a.png",
			"https://signed.example/b.png",
		]);
		preview?.querySelector<HTMLButtonElement>('[aria-label="引用元の画像 2 を拡大"]')?.click();
		await tick();
		expect(target.querySelector("img.lightbox-image")?.getAttribute("src")).toBe("https://signed.example/b.png");
		// 拡大を閉じても、作成画面は開いたまま
		target.querySelector<HTMLButtonElement>(".lightbox-close")?.click();
		await tick();
		expect(target.querySelector("img.lightbox-image")).toBeNull();
		expect(target.querySelector(".quote-preview")).not.toBeNull();
	});

	it("引用元に CW が無ければ、引用枠は本文を出す", async () => {
		const post = {
			...fixturePost(0),
			quoted_post_id: quoted.id,
			quoted_post: { ...quoted, cw_anime_id: null, cw_anime: null },
		};
		const target = await render(PostRow, post);
		expect(target.querySelector(".quoted-post")?.textContent).toContain("最終回で主人公が旅を終える");
	});
});

describe("引用枠の画像・作品名（#290）", () => {
	function quotedPost(overrides: Partial<NonNullable<Post["quoted_post"]>> = {}): NonNullable<Post["quoted_post"]> {
		return {
			id: "quoted-290",
			content: "",
			user_id: "preview-user-8",
			created_at: "2026-09-08T11:00:00.000Z",
			username: "image_author",
			display_name: null,
			avatar_url: null,
			cw_anime_id: null,
			cw_anime: null,
			image_urls: [],
			anime_id: null,
			anime: null,
			quoted_post_id: null,
			...overrides,
		};
	}

	async function renderQuote(
		component: typeof PostRow | typeof PostDetail | typeof LiveRoomPostCard,
		quoted: NonNullable<Post["quoted_post"]>,
		base: Post = fixturePost(0),
	) {
		const target = document.body.appendChild(document.createElement("div"));
		const instance = mount(component, {
			target,
			props: { post: { ...base, quoted_post_id: quoted.id, quoted_post: quoted } },
		});
		cleanup.push(() => unmount(instance));
		await tick();
		const quote = target.querySelector<HTMLAnchorElement>(".quoted-post");
		if (!quote) throw new Error("引用枠が出ていない");
		return { target, quote };
	}

	for (const [name, component] of [
		["タイムライン", PostRow],
		["投稿詳細", PostDetail],
		["実況ルーム", LiveRoomPostCard],
	] as const) {
		it(`${name}: 画像だけの投稿の引用は、縮小した画像を出し（ラベルは出さない）、押すと元の投稿へ`, async () => {
			const { quote } = await renderQuote(
				component,
				quotedPost({ image_urls: ["https://signed.example/a.png", "https://signed.example/b.png"] }),
			);
			const images = quote.querySelectorAll<HTMLImageElement>("img.quoted-post-image");
			expect([...images].map((img) => img.getAttribute("src"))).toEqual([
				"https://signed.example/a.png",
				"https://signed.example/b.png",
			]);
			expect(quote.querySelector(".quoted-post-placeholder")).toBeNull();
			// 画像は拡大のボタンにせず、引用枠ごと元の投稿へのリンクにする
			expect(quote.querySelector("button")).toBeNull();
			expect(quote.getAttribute("href")).toBe("/posts/quoted-290");
		});
	}

	it("作品引用だけの投稿の引用は、作品名を出す", async () => {
		const { quote } = await renderQuote(
			PostRow,
			quotedPost({ anime_id: "7", anime: { id: "7", title: "夜空のレコード" } }),
		);
		expect(quote.querySelector(".quoted-post-anime-title")?.textContent).toBe("夜空のレコード");
		expect(quote.querySelector(".quoted-post-placeholder")).toBeNull();
	});

	it("本文がある引用は、本文と画像・作品名を並べて出す（ラベルは出さない）", async () => {
		const { quote } = await renderQuote(
			PostRow,
			quotedPost({
				content: "このカット最高",
				image_urls: ["https://signed.example/a.png"],
				anime_id: "7",
				anime: { id: "7", title: "夜空のレコード" },
			}),
		);
		expect(quote.querySelector(".quoted-post-content")?.textContent).toBe("このカット最高");
		expect(quote.querySelector(".quoted-post-placeholder")).toBeNull();
		expect(quote.querySelectorAll("img.quoted-post-image")).toHaveLength(1);
		expect(quote.querySelector(".quoted-post-anime-title")?.textContent).toBe("夜空のレコード");
	});

	it("何も添付の無い空の引用でも、空の枠にしない", async () => {
		const { quote } = await renderQuote(PostRow, quotedPost());
		expect(quote.querySelector(".quoted-post-placeholder")?.textContent).toBe("投稿を表示");
	});

	it("引用元に CW があれば、画像・作品名を出さずに警告だけを出す", async () => {
		const { quote } = await renderQuote(
			PostRow,
			quotedPost({
				cw_anime_id: "42",
				cw_anime: { title: "星をめぐる旅" },
				image_urls: ["https://signed.example/spoiler.png"],
				anime_id: "42",
				anime: { id: "42", title: "星をめぐる旅" },
			}),
		);
		expect(quote.textContent).toContain("『星をめぐる旅』のネタバレを含む投稿");
		expect(quote.querySelector("img")).toBeNull();
		expect(quote.querySelector(".quoted-post-anime")).toBeNull();
	});

	it("引用した側の投稿に CW があれば、引用枠の画像も折り畳みの中に入る", async () => {
		const { target } = await renderQuote(
			PostRow,
			quotedPost({ image_urls: ["https://signed.example/a.png"] }),
			fixturePost(22),
		);
		expect(target.querySelector(".post-cw-content")?.getAttribute("aria-hidden")).toBe("true");
		expect(target.querySelector(".post-cw-content .quoted-post-image")).not.toBeNull();
	});
});

describe("実況ルームの返信の続き（#325）", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function reply(index: number) {
		const base = fixturePost(0);
		const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
		const second = String(index % 60).padStart(2, "0");
		const minute = String(Math.floor(index / 60)).padStart(2, "0");
		return {
			...base,
			id,
			parent_id: base.id,
			content: `返信${index}`,
			created_at: `2026-10-13T12:${minute}:${second}.000Z`,
		};
	}

	it("展開して返信を読み込んだ後に返信が付いたら、増えた分を一覧に取り足す（#324）", async () => {
		const all = [reply(0), reply(1)];
		let available = 1;
		const fetchMock = vi.fn(async (input: string) => {
			const url = new URL(input, "http://localhost");
			const limit = Number(url.searchParams.get("limit") ?? "3");
			// mode=recent は公開済みの返信のうち新しい limit 件を古い順に返す
			return Response.json({ replies: all.slice(0, available).slice(-limit) });
		});
		vi.stubGlobal("fetch", fetchMock);

		const props = $state({ post: { ...fixturePost(18), reply_count: 1 }, currentUserId: "preview-user-0" });
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, { target, props });
		cleanup.push(() => unmount(component));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]')?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(1));

		// ルームの再確認で返信数だけが 2 に更新される
		available = 2;
		props.post = { ...props.post, reply_count: 2 };
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(2));
		expect(target.querySelector(".live-reply:last-of-type")?.textContent).toContain("返信1");
		// 増えた1件だけを取り足し、一覧を出したまま更新する（読み込み中の表示に戻さない）
		const lastUrl = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), "http://localhost");
		expect(lastUrl.searchParams.get("mode")).toBe("recent");
		expect(lastUrl.searchParams.get("limit")).toBe("1");
		expect(target.querySelector(".live-more-replies")).toBeNull();
	});

	it("101件目以降も「さらに表示する」で辿れ、最新の返信を失わない", async () => {
		const all = Array.from({ length: 150 }, (_, i) => reply(i));
		const fetchMock = vi.fn(async (input: string) => {
			const url = new URL(input, "http://localhost");
			if (url.searchParams.get("mode") === "recent") return Response.json({ replies: all.slice(-3) });
			const afterId = url.searchParams.get("after_id");
			const start = afterId ? all.findIndex((r) => r.id === afterId) + 1 : 0;
			const page = all.slice(start, start + 100);
			const last = page[page.length - 1];
			return Response.json({
				replies: page,
				nextCursor: last ? { createdAt: last.created_at, id: last.id } : null,
				hasMore: start + 100 < all.length,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, {
			target,
			props: { post: { ...fixturePost(18), reply_count: 150 }, currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]')?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(3));
		expect(target.querySelector(".live-more-replies")?.textContent).toContain("残り147件");

		target.querySelector<HTMLButtonElement>(".live-more-replies")?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(150));
		// 取り切ったら追加のボタンは出さない。最新の返信も残っている
		expect(target.querySelector(".live-more-replies")).toBeNull();
		expect(target.querySelector(".live-reply:last-of-type")?.textContent).toContain("返信149");
		// 2ページ目は1ページ目の境界から続けて取る
		const allModeCalls = fetchMock.mock.calls
			.map(([input]) => new URL(input, "http://localhost"))
			.filter((u) => u.searchParams.get("mode") === "all");
		expect(allModeCalls).toHaveLength(2);
		expect(allModeCalls[1]?.searchParams.get("after_id")).toBe(all[99]?.id);
	});

	it("最新の返信がミュートなどで全部隠れても、「さらに表示する」で古い返信へ進める", async () => {
		const older = [reply(0), reply(1)];
		const fetchMock = vi.fn(async (input: string) => {
			const url = new URL(input, "http://localhost");
			// 最新3件はミュートした人の返信で、サーバーが除いて空になった
			if (url.searchParams.get("mode") === "recent") return Response.json({ replies: [] });
			return Response.json({ replies: older, nextCursor: null, hasMore: false });
		});
		vi.stubGlobal("fetch", fetchMock);

		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, {
			target,
			props: { post: { ...fixturePost(18), reply_count: 5 }, currentUserId: "preview-user-0" },
		});
		cleanup.push(() => unmount(component));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]')?.click();
		await vi.waitFor(() => expect(target.querySelector(".live-more-replies")).not.toBeNull());
		expect(target.querySelectorAll(".live-reply")).toHaveLength(0);

		target.querySelector<HTMLButtonElement>(".live-more-replies")?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(2));
	});
	it("ルームの再確認で見えなくなった返信は、開いている返信欄から外す（#559）", async () => {
		const all = [reply(0), reply(1), reply(2)];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ replies: all })),
		);
		const reported: [string, string[]][] = [];
		const props = $state({
			post: { ...fixturePost(18), reply_count: 3 },
			currentUserId: "preview-user-0",
			hiddenPostIds: new Set<string>() as ReadonlySet<string>,
			onOpenRepliesChange: (postId: string, ids: string[]) => reported.push([postId, ids]),
		});
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, { target, props });
		cleanup.push(() => unmount(component));
		await tick();
		const toggle = target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]');
		toggle?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(3));
		// 表示中の返信を新しい順に知らせ、ルームが再確認に含められるようにする
		expect(reported.at(-1)).toEqual([props.post.id, [all[2]?.id, all[1]?.id, all[0]?.id]]);

		// 返信者をミュートした・返信が削除されたなどで、再確認の結果に返信1が無かった
		props.hiddenPostIds = new Set([all[1]?.id ?? ""]);
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(2));
		expect(target.querySelector(".live-replies")?.textContent).not.toContain("返信1");
		expect(reported.at(-1)).toEqual([props.post.id, [all[2]?.id, all[0]?.id]]);

		// 閉じたら再確認の対象から外す
		toggle?.click();
		await tick();
		expect(reported.at(-1)).toEqual([props.post.id, []]);
	});

	it("返信が消えて返信数が減った後に付いた返信も取り込む（#559）", async () => {
		const all = [reply(0), reply(1)];
		const fetchMock = vi.fn(async (input: string) => {
			const url = new URL(input, "http://localhost");
			const limit = Number(url.searchParams.get("limit") ?? "3");
			return Response.json({ replies: all.slice(-limit) });
		});
		vi.stubGlobal("fetch", fetchMock);
		const props = $state({
			post: { ...fixturePost(18), reply_count: 2 },
			currentUserId: "preview-user-0",
			hiddenPostIds: new Set<string>() as ReadonlySet<string>,
		});
		const target = document.body.appendChild(document.createElement("div"));
		const component = mount(LiveRoomPostCard, { target, props });
		cleanup.push(() => unmount(component));
		await tick();
		target.querySelector<HTMLButtonElement>('[aria-label="投稿の返信を表示"]')?.click();
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(2));

		// 返信0が削除され、再確認で見えなくなり返信数も 1 に減る
		all.shift();
		props.hiddenPostIds = new Set([reply(0).id]);
		props.post = { ...props.post, reply_count: 1 };
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(1));

		// その後に新しい返信が付いて、返信数が 2 に戻る
		all.push(reply(2));
		props.post = { ...props.post, reply_count: 2 };
		await vi.waitFor(() => expect(target.querySelectorAll(".live-reply")).toHaveLength(2));
		expect(target.querySelector(".live-reply:last-of-type")?.textContent).toContain("返信2");
		expect(target.querySelector(".live-replies")?.textContent).not.toContain("返信0");
	});
});
