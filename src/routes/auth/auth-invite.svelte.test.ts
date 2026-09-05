import { mount, unmount } from "svelte";
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
		const form = target.querySelector<HTMLFormElement>('form[action="?/applyInvite&mode=register"]');

		expect(form).not.toBeNull();
		expect(form?.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/anime/42");

		await unmount(page);
		target.remove();
	});
});
