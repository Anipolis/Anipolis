import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({
	page: {
		get url() {
			return new URL(window.location.href);
		},
	},
}));

import SettingsPage from "./+page.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
	window.history.replaceState(null, "", "/");
});

function renderSettings(section: string, data: Record<string, unknown> = {}) {
	window.history.replaceState(null, "", `/settings?section=${section}`);
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(SettingsPage, {
		target,
		props: { data: { hasEmailProvider: true, pendingFollowRequestCount: 0, ...data } } as never,
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

const linksIn = (target: HTMLElement, section: string) =>
	[...target.querySelectorAll<HTMLAnchorElement>(`[data-section="${section}"] .settings-item-link`)].map((link) => [
		link.querySelector("strong")?.firstChild?.textContent?.trim(),
		link.getAttribute("href"),
	]);

describe("設定の一覧", () => {
	it("カテゴリを6つに分けて、サイドバーに並べる", () => {
		const target = renderSettings("account");
		const labels = [...target.querySelectorAll(".settings-nav-item")].map((el) => el.textContent?.trim());
		expect(labels).toEqual([
			"アカウント",
			"ログイン",
			"公開範囲",
			"ミュートとブロック",
			"通知",
			"Anipolisについて",
		]);
	});

	it("全カテゴリを見出し付きで描き、選んだカテゴリにだけ active を付ける（スマホでは全部見せる）", () => {
		const target = renderSettings("mute");
		const blocks = [...target.querySelectorAll<HTMLElement>(".settings-section-block")];
		expect(blocks.map((el) => el.dataset["section"])).toEqual([
			"account",
			"login",
			"visibility",
			"mute",
			"notify",
			"about",
		]);
		expect(blocks.filter((el) => el.classList.contains("active")).map((el) => el.dataset["section"])).toEqual([
			"mute",
		]);
	});

	it("利用規約・プライバシーポリシー・出典・権利・お問い合わせを並べる", () => {
		const target = renderSettings("about");
		expect(linksIn(target, "about")).toEqual([
			["利用規約", "/terms"],
			["プライバシーポリシー", "/privacy-policy"],
			["出典・権利", "/data-sources"],
			["お問い合わせ", "/contact"],
		]);
	});

	it("ログインの手段はアカウントから分け、パスキーと二段階認証は使えるときだけ出す", () => {
		const target = renderSettings("login", { passkeyEnabled: true, profile: { is_admin: false } });
		expect(linksIn(target, "login")).toEqual([
			["パスワードの変更", "/settings/account/password"],
			["パスキー", "/settings/passkeys"],
		]);
		expect(linksIn(target, "account").map(([, href]) => href)).toEqual([
			"/settings/account",
			"/settings/invites",
			"/settings/mylist-data",
			"/settings/account/delete",
		]);
	});

	it("公開範囲にスイッチを置き、フォローリクエストは申請が無くても出して件数を添える", () => {
		const empty = renderSettings("visibility");
		expect(empty.querySelectorAll('[data-section="visibility"] input[type="checkbox"]').length).toBe(2);
		expect(linksIn(empty, "visibility")).toEqual([["フォローリクエスト", "/settings/follow-requests"]]);
		expect(empty.querySelector(".settings-item-badge")).toBeNull();

		const withRequests = renderSettings("visibility", { pendingFollowRequestCount: 3 });
		expect(withRequests.querySelector('[data-section="visibility"] .settings-item-badge')?.textContent).toBe("3");
	});

	it("整理前の ?section=privacy・rooms は、公開範囲・通知として開く", () => {
		const privacy = renderSettings("privacy");
		expect(privacy.querySelector(".settings-section-block.active")?.getAttribute("data-section")).toBe(
			"visibility",
		);
		const rooms = renderSettings("rooms");
		expect(rooms.querySelector(".settings-section-block.active")?.getAttribute("data-section")).toBe("notify");
	});
});
