import { mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import ResetPasswordPage from "./+page.svelte";
import type { PageProps } from "./$types";

function mountPage(props: PageProps) {
	const target = document.createElement("div");
	document.body.appendChild(target);
	const page = mount(ResetPasswordPage, { target, props });
	return {
		target,
		cleanup: async () => {
			await unmount(page);
			target.remove();
		},
	};
}

function pageProps(data: Partial<PageProps["data"]>, form: PageProps["form"] = null): PageProps {
	return {
		params: {},
		data: { state: "ready", email: null, providers: [], ...data } as unknown as PageProps["data"],
		form,
	} as unknown as PageProps;
}

describe("reset password page", () => {
	it("renders the new password form with confirmation when the link was verified", async () => {
		const { target, cleanup } = mountPage(pageProps({ state: "ready", email: "user@example.com" }));

		const form = target.querySelector<HTMLFormElement>('form[action="?/setPassword"]');
		expect(form).not.toBeNull();
		expect(form?.querySelector<HTMLInputElement>('input[name="password"]')?.minLength).toBe(6);
		expect(form?.querySelector<HTMLInputElement>('input[name="confirm"]')).not.toBeNull();
		expect(target.textContent).toContain("user@example.com");

		await cleanup();
	});

	it("shows the field error returned by the action", async () => {
		const { target, cleanup } = mountPage(
			pageProps({ state: "ready" }, {
				field: "confirm",
				message: "パスワードが一致しません",
			} as PageProps["form"]),
		);

		expect(target.querySelector(".field-error-msg")?.textContent).toContain("パスワードが一致しません");
		expect(target.querySelector('input[name="confirm"]')?.classList.contains("field-error")).toBe(true);

		await cleanup();
	});

	it("links back to the request page for an expired link", async () => {
		const { target, cleanup } = mountPage(pageProps({ state: "expired" }));

		expect(target.querySelector('form[action="?/setPassword"]')).toBeNull();
		expect(target.querySelector('[role="alert"]')?.textContent).toContain("有効期限が切れています");
		expect(target.querySelector<HTMLAnchorElement>('a[href="/auth/forgot-password"]')).not.toBeNull();

		await cleanup();
	});

	it("tells OAuth-only accounts which provider to sign in with", async () => {
		const { target, cleanup } = mountPage(pageProps({ state: "oauth_only", providers: ["Google", "Discord"] }));

		expect(target.querySelector('form[action="?/setPassword"]')).toBeNull();
		// テンプレート整形で改行が入るため、描画時と同じく空白を畳んでから比較する
		expect(target.textContent?.replace(/\s+/g, " ")).toContain("Google / Discord でのログインに使われています");
		expect(target.querySelector<HTMLAnchorElement>('a[href="/auth?mode=login"]')).not.toBeNull();

		await cleanup();
	});

	it("shows the success message instead of the form after resetting", async () => {
		const { target, cleanup } = mountPage(pageProps({ state: "ready" }, { success: true } as PageProps["form"]));

		expect(target.querySelector('form[action="?/setPassword"]')).toBeNull();
		expect(target.querySelector(".flash-success")?.textContent).toContain("パスワードを再設定しました");

		await cleanup();
	});
});
