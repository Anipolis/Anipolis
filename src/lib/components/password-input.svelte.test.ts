import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import PasswordInput from "./PasswordInput.svelte";

describe("PasswordInput（#420）", () => {
	it("ボタンで表示・非表示を切り替え、入力の値は保つ", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(PasswordInput, {
			target,
			props: { id: "pw", name: "password", autocomplete: "current-password", required: true },
		});
		const input = target.querySelector<HTMLInputElement>("#pw");
		const toggle = target.querySelector<HTMLButtonElement>("button.password-toggle");
		if (!input || !toggle) throw new Error("not rendered");

		expect(input.type).toBe("password");
		expect(input.name).toBe("password");
		expect(input.autocomplete).toBe("current-password");
		expect(toggle.getAttribute("aria-label")).toBe("パスワードを表示");

		input.value = "secret-123";
		toggle.click();
		flushSync();
		expect(input.type).toBe("text");
		expect(input.value).toBe("secret-123");
		expect(toggle.getAttribute("aria-label")).toBe("パスワードを隠す");
		expect(toggle.getAttribute("aria-pressed")).toBe("true");

		toggle.click();
		flushSync();
		expect(input.type).toBe("password");

		await unmount(component);
		target.remove();
	});

	it("invalid のときは枠を赤くし、読み上げにも伝える", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const component = mount(PasswordInput, {
			target,
			props: { id: "pw2", name: "password", autocomplete: "new-password", invalid: true, minlength: 6 },
		});
		const input = target.querySelector<HTMLInputElement>("#pw2");
		expect(input?.classList.contains("field-error")).toBe(true);
		expect(input?.getAttribute("aria-invalid")).toBe("true");
		expect(input?.minLength).toBe(6);
		await unmount(component);
		target.remove();
	});
});
