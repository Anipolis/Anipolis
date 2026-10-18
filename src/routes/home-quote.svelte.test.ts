import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	replaceState: vi.fn(),
	pushState: vi.fn(),
}));

vi.mock("$app/navigation", () => navigation);
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({
	page: {
		get url() {
			return locationState.url;
		},
		get state() {
			return locationState.state;
		},
		data: {},
	},
	navigating: { type: null, from: null, to: null },
}));

import HomePage from "./+page.svelte";

const locationState = $state<{ url: URL; state: App.PageState }>({
	url: new URL("http://localhost/"),
	state: {},
});

const QUOTED_ANIME = {
	id: "5",
	title: "ぼっちざろっく",
	title_en: null,
	cover_url: null,
	official_hashtag: null,
};

function extras(initialAnime: typeof QUOTED_ANIME | null) {
	return {
		trending: [],
		animeTrending: [],
		liveRooms: [],
		initialAnime,
		initialExchangeId: null,
		initialExchangeShare: null,
		initialContent: "",
		watchingAnime: [],
	};
}

function pageData(initialAnime: typeof QUOTED_ANIME | null, delayMs = 0, userId = "me") {
	return {
		profile: { id: userId, username: userId, avatar_url: null },
		session: { access_token: "t" },
		user: { id: userId },
		tab: "all",
		before: null,
		beforeId: null,
		alternateTimeline: Promise.resolve({ posts: [], nextCursor: null }),
		timeline: Promise.resolve({ posts: [], nextCursor: null }),
		// 実際の再読み込みはストリーミングで数百 ms 保留になる。即時解決だと待機表示を経由しないので遅らせる
		pageExtras:
			delayMs > 0
				? new Promise<ReturnType<typeof extras>>((resolve) =>
						setTimeout(() => resolve(extras(initialAnime)), delayMs),
					)
				: Promise.resolve(extras(initialAnime)),
	};
}

async function settle() {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
	flushSync();
}

function desktopComposer(target: HTMLElement) {
	const composer = target.querySelector<HTMLElement>("#compose");
	if (!composer) throw new Error("desktop composer container was not rendered");
	return composer;
}

describe("home page quote flow (#294)", () => {
	beforeEach(() => {
		navigation.goto.mockClear();
		navigation.replaceState.mockClear();
		window.history.replaceState({}, "", "/?quote_anime=5#compose");
		locationState.url = new URL(window.location.href);
		locationState.state = {};
		navigation.pushState.mockReset();
		navigation.pushState.mockImplementation((url: URL, state: App.PageState) => {
			// SvelteKit と同じくブラウザの URL と page.state だけを更新する。
			// page.url まで更新すると、実際には切り替わらない不具合を見逃す。
			window.history.pushState(state, "", url);
			locationState.state = state;
		});
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("switches between retained timelines without navigation or another loading state", async () => {
		const props = $state({ data: pageData(null) });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(HomePage, { target, props: props as never });
		await settle();
		const links = target.querySelectorAll<HTMLAnchorElement>(".timeline-tab");
		const tabBar = target.querySelector(".timeline-tabs");
		const panels = [...target.querySelectorAll(".home-timeline")];
		expect(tabBar?.classList.contains("following-active")).toBe(false);
		const visibleText = () => target.querySelector(".home-timeline:not([hidden])")?.textContent;

		links[1]?.click();
		await settle();
		expect(new URL(window.location.href).searchParams.get("tab")).toBe("following");
		expect(locationState.url.searchParams.get("tab")).toBeNull();
		expect(links[1]?.getAttribute("aria-current")).toBe("page");
		expect(tabBar?.classList.contains("following-active")).toBe(true);
		expect(visibleText()).toContain("フォロー中のユーザーの投稿がありません");
		links[0]?.click();
		await settle();
		expect(visibleText()).toContain("まだ投稿がありません");
		expect(tabBar?.classList.contains("following-active")).toBe(false);
		// アニメーションのために一覧を作り直さない（楽観更新もそのまま残す）。
		expect(target.querySelectorAll(".home-timeline")[0]).toBe(panels[0]);
		expect(target.querySelectorAll(".home-timeline")[1]).toBe(panels[1]);
		expect(target.querySelector(".posts-loading-spinner")).toBeNull();
		expect(navigation.goto).not.toHaveBeenCalled();
		expect(navigation.pushState).toHaveBeenCalledTimes(2);

		// shallow な戻る・進むでは page.state から選択を復元する。
		locationState.state = { homeTimelineTab: "following" };
		await settle();
		expect(links[1]?.getAttribute("aria-current")).toBe("page");
		expect(visibleText()).toContain("フォロー中のユーザーの投稿がありません");
		locationState.state = {};
		await settle();
		expect(links[0]?.getAttribute("aria-current")).toBe("page");
		expect(visibleText()).toContain("まだ投稿がありません");
		await unmount(component);
		target.remove();
	});

	it("keeps the quoted anime in the composer after the page data is reloaded without it", async () => {
		const props = $state({ data: pageData(QUOTED_ANIME) });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(HomePage, { target, props: props as never });
		await settle();

		expect(desktopComposer(target).textContent).toContain("ぼっちざろっく");

		// URL 掃除などで load が再実行され、quote_anime の無い pageExtras に差し替わった状況
		props.data = pageData(null, 30);
		await settle();
		// 再読み込みの保留中もフォーム（と引用）は残る
		expect(desktopComposer(target).textContent).toContain("ぼっちざろっく");

		await new Promise((resolve) => setTimeout(resolve, 60));
		await settle();
		expect(desktopComposer(target).textContent).toContain("ぼっちざろっく");

		await unmount(component);
		target.remove();
	});

	it("opens the mobile compose modal with the quote and keeps it across a reload", async () => {
		vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query }));
		// モーダルの下書き復元（#284）が作り直し後のフォームに引用を戻して不具合を覆い隠さないよう、
		// 下書きの保存先を無効にしてフォームが作り直されないこと自体を確かめる
		const noopStorage = {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
			clear: () => {},
			key: () => null,
			length: 0,
		};
		vi.stubGlobal("localStorage", noopStorage);
		const props = $state({ data: pageData(QUOTED_ANIME) });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(HomePage, { target, props: props as never });
		await settle();

		const modalBody = () => target.querySelector<HTMLElement>(".compose-modal-body");
		expect(modalBody()?.textContent).toContain("ぼっちざろっく");

		props.data = pageData(null, 30);
		await new Promise((resolve) => setTimeout(resolve, 60));
		await settle();
		expect(modalBody()?.textContent).toContain("ぼっちざろっく");

		await unmount(component);
		target.remove();
		const { composeOpen } = await import("$lib/stores/compose");
		composeOpen.set(false);
	});

	it("drops the held composer when the account switches, so nothing carries over", async () => {
		const props = $state({ data: pageData(QUOTED_ANIME) });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(HomePage, { target, props: props as never });
		await settle();
		expect(desktopComposer(target).textContent).toContain("ぼっちざろっく");

		// アカウント切替: 同じページのまま別ユーザーのデータで再読み込みされる
		props.data = pageData(null, 30, "other");
		await settle();
		expect(desktopComposer(target).querySelector("[role=status]")).not.toBeNull();
		expect(desktopComposer(target).textContent).not.toContain("ぼっちざろっく");

		await new Promise((resolve) => setTimeout(resolve, 60));
		await settle();
		expect(desktopComposer(target).querySelector("[role=status]")).toBeNull();
		expect(desktopComposer(target).textContent).not.toContain("ぼっちざろっく");

		await unmount(component);
		target.remove();
	});

	it("cleans the quote params from the URL without re-running the page load", async () => {
		const props = $state({ data: pageData(QUOTED_ANIME) });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(HomePage, { target, props: props as never });
		await settle();

		// goto は load を再実行するので使わない。URL だけ書き換える
		expect(navigation.goto).not.toHaveBeenCalled();
		expect(navigation.replaceState).toHaveBeenCalledTimes(1);
		const [cleaned] = navigation.replaceState.mock.calls[0] as unknown as [string];
		const url = new URL(cleaned, window.location.origin);
		expect(url.searchParams.has("quote_anime")).toBe(false);
		expect(url.hash).toBe("");

		await unmount(component);
		target.remove();
	});
});
