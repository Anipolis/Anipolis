import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageState = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));

vi.mock("$app/state", () => ({ page: pageState }));

import TrendingPanel from "./TrendingPanel.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function renderPanel(user: unknown) {
	pageState.data = { user };
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(TrendingPanel, { target, props: { trending: [] } });
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

function footerHrefs(target: HTMLElement) {
	return [...target.querySelectorAll<HTMLAnchorElement>(".trending-panel-footer-link")].map((link) =>
		link.getAttribute("href"),
	);
}

describe("トレンド欄下のリンク", () => {
	it("未ログイン時は利用規約・プライバシーポリシー・出典・権利・お問い合わせへのリンクを出す", () => {
		const target = renderPanel(null);
		expect(footerHrefs(target)).toEqual(["/terms", "/privacy-policy", "/data-sources", "/contact"]);
	});

	it("ログイン中は設定タブから辿れるのでリンクを出さない", () => {
		const target = renderPanel({ id: "user-1" });
		expect(footerHrefs(target)).toEqual([]);
	});
});
