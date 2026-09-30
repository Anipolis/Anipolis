import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const pageState = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));

vi.mock("$app/state", () => ({ page: pageState }));

import LegalDocument from "./LegalDocument.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

function renderDocument(user: unknown) {
	pageState.data = { user };
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(LegalDocument, {
		target,
		props: { title: "利用規約", html: "<h1>利用規約</h1><p>本文</p>" },
	});
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

describe("規約・ポリシーページ", () => {
	it("本文の HTML を表示する", () => {
		const target = renderDocument(null);
		expect(target.querySelector("h1")?.textContent).toBe("利用規約");
	});

	it("ログイン中は設定の「Anipolisについて」へ戻るリンクを出す", () => {
		const target = renderDocument({ id: "user-1" });
		expect(target.querySelector(".back-link")?.getAttribute("href")).toBe("/settings?section=about");
	});

	it("未ログイン時は設定へ戻るリンクを出さない", () => {
		const target = renderDocument(null);
		expect(target.querySelector(".back-link")).toBeNull();
	});
});
