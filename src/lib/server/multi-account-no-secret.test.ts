import { describe, expect, it, vi } from "vitest";

// 署名鍵がどれも設定されていない環境を再現する
vi.mock("$app/environment", () => ({ dev: true }));
vi.mock("$env/dynamic/private", () => ({ env: {} }));

import type { Cookies } from "@sveltejs/kit";
import type { StoredAccount } from "$lib/types";
import { getExtraAccounts, setExtraAccounts } from "./multi-account";

const COOKIE_NAME = "anipolis_extra_accounts";

function makeCookies(initial?: Record<string, string>): Cookies & { store: Map<string, string> } {
	const store = new Map<string, string>(Object.entries(initial ?? {}));
	return {
		store,
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => store.set(name, value),
		delete: (name: string) => store.delete(name),
		getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
		serialize: () => "",
	} as unknown as Cookies & { store: Map<string, string> };
}

const account: StoredAccount = {
	userId: "u1",
	refreshToken: "refresh.u1.token",
	profile: { username: "alice", display_name: null, avatar_url: null },
};

describe("multi-account signed cookie（署名鍵なし環境）", () => {
	it("鍵が無ければ未署名で保存せず Cookie を残さない", () => {
		const cookies = makeCookies();
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		setExtraAccounts(cookies, [account]);
		expect(cookies.store.has(COOKIE_NAME)).toBe(false);
		expect(errSpy).toHaveBeenCalledOnce();
		errSpy.mockRestore();
	});

	it("鍵が無ければ既存 Cookie も信用せず空配列を返す", () => {
		// 有効そうに見える値が入っていても、鍵が無い限り検証不能なので空
		const cookies = makeCookies({ [COOKIE_NAME]: "cGF5bG9hZA.signature" });
		expect(getExtraAccounts(cookies)).toEqual([]);
	});
});
