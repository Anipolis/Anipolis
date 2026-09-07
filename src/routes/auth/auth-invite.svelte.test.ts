import { mount, tick, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import AuthPage from "./+page.svelte";
import type { PageProps } from "./$types";

describe("auth invite gate", () => {
	it("submits the registration mode while preserving next", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = {
			params: {},
			data: {
				mode: "register",
				next: "/anime/42",
				betaGateEnabled: true,
				inviteCode: "",
				inviteCodeValid: false,
				error: null,
			} as unknown as PageProps["data"],
			form: null,
		} satisfies PageProps;

		const page = mount(AuthPage, { target, props });
		const form = target.querySelector<HTMLFormElement>(
			'form[action="?/applyInvite&mode=register&next=%2Fanime%2F42"]',
		);

		expect(form).not.toBeNull();
		expect(form?.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/anime/42");

		await unmount(page);
		target.remove();
	});

	it("keeps the failed action next value when the form returns an error", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = {
			params: {},
			data: {
				mode: "register",
				next: "/",
				betaGateEnabled: true,
				inviteCode: "",
				inviteCodeValid: false,
				error: null,
			} as unknown as PageProps["data"],
			form: { mode: "register", next: "/anime/42", message: "招待コードが無効です" },
		} as unknown as PageProps;

		const page = mount(AuthPage, { target, props });
		const form = target.querySelector<HTMLFormElement>(
			'form[action="?/applyInvite&mode=register&next=%2Fanime%2F42"]',
		);

		expect(form).not.toBeNull();
		expect(form?.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/anime/42");

		await unmount(page);
		target.remove();
	});

	it("prefills the invite input from the current page data", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = {
			params: {},
			data: {
				mode: "register",
				next: "/",
				betaGateEnabled: true,
				inviteCode: "FROM-LINK",
				inviteCodeValid: false,
				error: null,
			} as unknown as PageProps["data"],
			form: null,
		} satisfies PageProps;

		const page = mount(AuthPage, { target, props });
		await tick();

		expect(target.querySelector<HTMLInputElement>("#invite-code-gate")?.value).toBe("FROM-LINK");

		await unmount(page);
		target.remove();
	});

	it("preserves a manually entered invite code in the OAuth form", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = {
			params: {},
			data: {
				mode: "register",
				next: "/",
				betaGateEnabled: true,
				inviteCode: "",
				inviteCodeValid: false,
				error: null,
			} as unknown as PageProps["data"],
			form: null,
		} satisfies PageProps;

		const page = mount(AuthPage, { target, props });
		await tick();
		const input = target.querySelector<HTMLInputElement>("#invite-code-gate");
		if (!input) throw new Error("invite input was not rendered");
		input.value = "MANUAL-CODE";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await tick();

		expect(target.querySelector<HTMLInputElement>('input[name="invite_code"]')?.value).toBe("MANUAL-CODE");

		await unmount(page);
		target.remove();
	});
});
