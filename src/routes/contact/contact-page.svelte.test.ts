import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { data: { user: null } } }));

import ContactPage from "./+page.svelte";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
	vi.restoreAllMocks();
});

function renderPage() {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const component = mount(ContactPage, { target });
	flushSync();
	cleanup = async () => {
		await unmount(component);
		target.remove();
	};
	return target;
}

function mockClipboard(writeText: (text: string) => Promise<void>) {
	Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("お問い合わせページ", () => {
	it("用途別のメールアドレスを文字で表示し、メールアプリで開くリンクも添える", () => {
		const target = renderPage();
		const emails = [...target.querySelectorAll(".contact-email")].map((el) => el.textContent);
		expect(emails).toEqual(["contact@anipolis.net", "privacy@anipolis.net"]);

		const mailtos = [...target.querySelectorAll<HTMLAnchorElement>(".contact-mailto")].map((a) =>
			a.getAttribute("href"),
		);
		expect(mailtos).toEqual(["mailto:contact@anipolis.net", "mailto:privacy@anipolis.net"]);
	});

	it("コピーボタンでアドレスをクリップボードに書き込み、完了を表示する", async () => {
		const writeText = vi.fn(() => Promise.resolve());
		mockClipboard(writeText);
		const target = renderPage();

		const button = target.querySelector<HTMLButtonElement>(".contact-copy");
		button?.click();
		await tick();
		await tick();

		expect(writeText).toHaveBeenCalledWith("contact@anipolis.net");
		expect(button?.getAttribute("aria-label")).toBe("コピーしました");
		expect(button?.querySelector(".i-lucide-check")).not.toBeNull();
	});

	it("コピーに失敗したら手動でコピーするよう案内する", async () => {
		mockClipboard(() => Promise.reject(new Error("denied")));
		const target = renderPage();

		target.querySelectorAll<HTMLButtonElement>(".contact-copy")[1]?.click();
		await tick();
		await tick();

		expect(target.querySelector(".contact-copy-error")?.textContent).toContain("コピーできませんでした");
	});
});
