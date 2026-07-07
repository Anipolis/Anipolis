import { describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ dev: true }));
vi.mock("$env/dynamic/private", () => ({ env: { MULTI_ACCOUNT_COOKIE_SECRET: "unit-test-secret-value" } }));

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

const account = (userId: string, username: string): StoredAccount => ({
	userId,
	refreshToken: `refresh.${userId}.token`,
	profile: { username, display_name: null, avatar_url: null },
});

describe("multi-account signed cookie", () => {
	it("署名して書き込み、検証して読み戻せる（ラウンドトリップ）", () => {
		const cookies = makeCookies();
		const accounts = [account("u1", "alice")];
		setExtraAccounts(cookies, accounts);

		const raw = cookies.store.get(COOKIE_NAME);
		expect(raw).toBeDefined();
		expect(raw).toContain("."); // <payload>.<signature>
		expect(getExtraAccounts(cookies)).toEqual(accounts);
	});

	it("ペイロード改ざんは検出して空配列を返す", () => {
		const cookies = makeCookies();
		setExtraAccounts(cookies, [account("u1", "alice")]);
		const raw = cookies.store.get(COOKIE_NAME) ?? "";
		const [payload, sig] = raw.split(".");
		// 別ユーザーの payload に差し替えて署名は元のまま
		const forgedPayload = Buffer.from(JSON.stringify([account("attacker", "attacker")])).toString("base64url");
		cookies.store.set(COOKIE_NAME, `${forgedPayload}.${sig}`);
		expect(getExtraAccounts(cookies)).toEqual([]);
		expect(payload).toBeTruthy();
	});

	it("署名が壊れていれば空配列を返す", () => {
		const cookies = makeCookies();
		setExtraAccounts(cookies, [account("u1", "alice")]);
		const raw = cookies.store.get(COOKIE_NAME) ?? "";
		const [payload] = raw.split(".");
		cookies.store.set(COOKIE_NAME, `${payload}.deadbeef`);
		expect(getExtraAccounts(cookies)).toEqual([]);
	});

	it("旧形式（未署名の生JSON）は信用せず空配列を返す", () => {
		const legacy = JSON.stringify([account("u1", "alice")]);
		const cookies = makeCookies({ [COOKIE_NAME]: legacy });
		expect(getExtraAccounts(cookies)).toEqual([]);
	});

	it("追加アカウントは最大2件に制限される", () => {
		const cookies = makeCookies();
		setExtraAccounts(cookies, [account("u1", "a"), account("u2", "b"), account("u3", "c")]);
		const restored = getExtraAccounts(cookies);
		expect(restored).toHaveLength(2);
		expect(restored.map((a) => a.userId)).toEqual(["u1", "u2"]);
	});

	it("空配列を渡すと Cookie を削除する", () => {
		const cookies = makeCookies();
		setExtraAccounts(cookies, [account("u1", "alice")]);
		expect(cookies.store.has(COOKIE_NAME)).toBe(true);
		setExtraAccounts(cookies, []);
		expect(cookies.store.has(COOKIE_NAME)).toBe(false);
	});
});
