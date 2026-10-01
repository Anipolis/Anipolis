import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
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

function renderSettings(section: string) {
	window.history.replaceState(null, "", `/settings?section=${section}`);
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(SettingsPage, {
		target,
		props: { data: { hasEmailProvider: true, pendingFollowRequestCount: 0 } } as never,
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

describe("設定のAnipolisについてタブ", () => {
	it("サイドバーにAnipolisについてタブを表示する", () => {
		const target = renderSettings("account");
		const labels = [...target.querySelectorAll(".settings-nav-item")].map((el) => el.textContent?.trim());
		expect(labels).toContain("Anipolisについて");
	});

	it("利用規約・プライバシーポリシー・出典・権利・お問い合わせを並べる", () => {
		const target = renderSettings("about");
		const links = [...target.querySelectorAll<HTMLAnchorElement>(".settings-item-link")].map((link) => [
			link.querySelector("strong")?.textContent,
			link.getAttribute("href"),
		]);

		expect(links).toEqual([
			["利用規約", "/terms"],
			["プライバシーポリシー", "/privacy-policy"],
			["出典・権利", "/data-sources"],
			["お問い合わせ", "/contact"],
		]);
	});

	it("プライバシーと安全タブからはプライバシーポリシーを外す", () => {
		const target = renderSettings("privacy");
		const hrefs = [...target.querySelectorAll<HTMLAnchorElement>(".settings-item-link")].map((link) =>
			link.getAttribute("href"),
		);
		expect(hrefs).not.toContain("/privacy-policy");
	});
});
