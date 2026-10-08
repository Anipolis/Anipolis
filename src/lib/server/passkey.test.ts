import type { Cookies } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webauthn = vi.hoisted(() => ({
	generateRegistrationOptions: vi.fn(),
	verifyRegistrationResponse: vi.fn(),
	generateAuthenticationOptions: vi.fn(),
	verifyAuthenticationResponse: vi.fn(),
}));
const admin = vi.hoisted(() => ({ client: null as unknown }));
const beta = vi.hoisted(() => ({ gate: false, member: true }));

vi.mock("@simplewebauthn/server", () => webauthn);
vi.mock("$env/dynamic/private", () => ({ env: { MULTI_ACCOUNT_COOKIE_SECRET: "test-secret" } }));
vi.mock("$lib/server/supabase-admin", () => ({ createServiceRoleClient: () => admin.client }));
vi.mock("$lib/server/discord", () => ({
	isBetaGateEnabled: () => beta.gate,
	isBetaMember: () => beta.member,
}));

const {
	finishPasskeyLogin,
	finishPasskeyRegistration,
	isRecentlyAuthenticated,
	setChallengeCookie,
	startPasskeyRegistration,
	takeChallengeCookie,
} = await import("./passkey");

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const url = new URL("https://anipolis.example/api/auth/passkey/authentication/verify");

function makeCookies(): Cookies & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value),
		delete: (name: string) => void store.delete(name),
	} as unknown as Cookies & { store: Map<string, string> };
}

// await できて、さらに .eq() / .maybeSingle() も続けられる PostgREST ビルダーの代用品
function makeTable(results: { maybeSingle?: unknown; awaited?: unknown; insert?: unknown } = {}) {
	const chain: Record<string, ReturnType<typeof vi.fn>> = {};
	const awaitable = () =>
		Object.assign(Promise.resolve(results.awaited ?? { data: [], error: null }), chain) as unknown;
	chain["select"] = vi.fn(() => chain);
	chain["update"] = vi.fn(() => chain);
	chain["delete"] = vi.fn(() => chain);
	chain["eq"] = vi.fn(awaitable);
	chain["order"] = vi.fn(awaitable);
	chain["insert"] = vi.fn(async () => results.insert ?? { error: null });
	chain["maybeSingle"] = vi.fn(async () => results.maybeSingle ?? { data: null, error: null });
	return chain;
}

function sessionSignedInAt(ms: number) {
	const payload = Buffer.from(JSON.stringify({ amr: [{ method: "oauth", timestamp: Math.floor(ms / 1000) }] }));
	return { access_token: `header.${payload.toString("base64url")}.signature` } as never;
}

const credentialResponse = {
	id: "cred-1",
	rawId: "cred-1",
	type: "public-key",
	response: { clientDataJSON: "x", authenticatorData: "y", signature: "z" },
	clientExtensionResults: {},
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	beta.gate = false;
	beta.member = true;
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("challenge cookie", () => {
	it("保存したチャレンジを1回だけ取り出せる", () => {
		const cookies = makeCookies();
		expect(setChallengeCookie(cookies, { purpose: "login", challenge: "abc", userId: null })).toBe(true);
		expect(takeChallengeCookie(cookies, "login")).toMatchObject({ challenge: "abc", userId: null });
		expect(takeChallengeCookie(cookies, "login")).toBeNull();
	});

	it("改ざんされた Cookie は使わない", () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "register", challenge: "abc", userId: "user-1" });
		const [name, value] = [...cookies.store.entries()][0] ?? ["", ""];
		const [, signature] = value.split(".");
		const forged = Buffer.from(
			JSON.stringify({ purpose: "register", challenge: "abc", userId: "attacker", expiresAt: NOW + 60_000 }),
		).toString("base64url");
		cookies.store.set(name, `${forged}.${signature}`);
		expect(takeChallengeCookie(cookies, "register")).toBeNull();
	});

	it("用途が違うチャレンジは使わない", () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "register", challenge: "abc", userId: "user-1" });
		expect(takeChallengeCookie(cookies, "login")).toBeNull();
	});

	it("5分を過ぎたチャレンジは使わない", () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "login", challenge: "abc", userId: null }, NOW);
		expect(takeChallengeCookie(cookies, "login", NOW + 5 * 60_000 + 1)).toBeNull();
	});
});

describe("isRecentlyAuthenticated", () => {
	it("10分以内にログインしたセッションだけを新しいとみなす", () => {
		expect(isRecentlyAuthenticated(sessionSignedInAt(NOW - 5 * 60_000))).toBe(true);
		expect(isRecentlyAuthenticated(sessionSignedInAt(NOW - 11 * 60_000))).toBe(false);
		expect(isRecentlyAuthenticated(null)).toBe(false);
	});
});

describe("startPasskeyRegistration", () => {
	it("ログインし直していなければオプションを発行しない", async () => {
		const result = await startPasskeyRegistration({
			supabase: { from: vi.fn() } as never,
			user: { id: "user-1" } as never,
			session: sessionSignedInAt(NOW - 60 * 60_000),
			url,
			cookies: makeCookies(),
		});
		expect(result).toMatchObject({ ok: false, status: 403, code: "reauth_required" });
		expect(webauthn.generateRegistrationOptions).not.toHaveBeenCalled();
	});

	it("登録済みのパスキーを除外してオプションを発行する", async () => {
		const credentials = makeTable({
			awaited: { data: [{ credential_id: "old", transports: ["internal"] }], error: null },
		});
		const profiles = makeTable({
			maybeSingle: { data: { username: "taro", display_name: "たろう" }, error: null },
		});
		const supabase = { from: vi.fn((table: string) => (table === "profiles" ? profiles : credentials)) };
		webauthn.generateRegistrationOptions.mockResolvedValue({ challenge: "reg-challenge" });
		const cookies = makeCookies();

		const result = await startPasskeyRegistration({
			supabase: supabase as never,
			user: { id: "user-1" } as never,
			session: sessionSignedInAt(NOW - 60_000),
			url,
			cookies,
		});

		expect(result).toEqual({ ok: true, data: { challenge: "reg-challenge" } });
		expect(webauthn.generateRegistrationOptions).toHaveBeenCalledWith(
			expect.objectContaining({
				rpID: "anipolis.example",
				userName: "taro",
				excludeCredentials: [{ id: "old", transports: ["internal"] }],
			}),
		);
		expect(takeChallengeCookie(cookies, "register")).toMatchObject({
			challenge: "reg-challenge",
			userId: "user-1",
		});
	});
});

describe("finishPasskeyRegistration", () => {
	function registrationContext(cookies: Cookies, userId = "user-1") {
		return {
			supabase: {} as never,
			user: { id: userId } as never,
			session: sessionSignedInAt(NOW - 60_000),
			url,
			cookies,
			body: { response: credentialResponse },
		};
	}

	it("別のユーザーが発行したチャレンジでは登録しない", async () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "register", challenge: "abc", userId: "someone-else" });
		const result = await finishPasskeyRegistration(registrationContext(cookies));
		expect(result).toMatchObject({ ok: false, status: 400 });
		expect(webauthn.verifyRegistrationResponse).not.toHaveBeenCalled();
	});

	it("検証を通った公開鍵を service role で保存する", async () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "register", challenge: "abc", userId: "user-1" });
		const table = makeTable();
		admin.client = { from: vi.fn(() => table) };
		webauthn.verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: {
					id: "cred-1",
					publicKey: new Uint8Array([1, 2, 3]),
					counter: 0,
					transports: ["internal"],
				},
				credentialDeviceType: "multiDevice",
				credentialBackedUp: true,
				aaguid: "aaguid-1",
			},
		});

		const result = await finishPasskeyRegistration(registrationContext(cookies));

		expect(result).toEqual({ ok: true, data: { registered: true } });
		expect(webauthn.verifyRegistrationResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedChallenge: "abc",
				expectedOrigin: "https://anipolis.example",
				expectedRPID: "anipolis.example",
				requireUserVerification: true,
			}),
		);
		expect(table["insert"]).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: "user-1",
				credential_id: "cred-1",
				public_key: "AQID",
				backed_up: true,
			}),
		);
	});

	it("重複した資格情報は 409 にする", async () => {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "register", challenge: "abc", userId: "user-1" });
		admin.client = { from: vi.fn(() => makeTable({ insert: { error: { code: "23505" } } })) };
		webauthn.verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: {
				credential: { id: "cred-1", publicKey: new Uint8Array([1]), counter: 0 },
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
				aaguid: "aaguid-1",
			},
		});
		expect(await finishPasskeyRegistration(registrationContext(cookies))).toMatchObject({ ok: false, status: 409 });
	});
});

describe("finishPasskeyLogin", () => {
	const storedCredential = {
		id: "row-1",
		user_id: "user-1",
		credential_id: "cred-1",
		public_key: "AQID",
		counter: 3,
		transports: ["internal"],
	};

	function setupAdmin(options: { stored?: unknown; bannedUntil?: string } = {}) {
		const table = makeTable({ maybeSingle: { data: options.stored ?? storedCredential, error: null } });
		const getUserById = vi.fn(async () => ({
			data: { user: { id: "user-1", email: "u@example.com", banned_until: options.bannedUntil } },
			error: null,
		}));
		const generateLink = vi.fn(async () => ({ data: { properties: { hashed_token: "hashed" } }, error: null }));
		admin.client = { from: vi.fn(() => table), auth: { admin: { getUserById, generateLink } } };
		return { table, getUserById, generateLink };
	}

	function makeSupabase() {
		return {
			auth: {
				verifyOtp: vi.fn(async () => ({ error: null })),
				getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
				signOut: vi.fn(async () => ({ error: null })),
			},
		};
	}

	function loginCookies() {
		const cookies = makeCookies();
		setChallengeCookie(cookies, { purpose: "login", challenge: "login-challenge", userId: null });
		return cookies;
	}

	it("チャレンジが無ければ検証しない", async () => {
		const result = await finishPasskeyLogin({
			supabase: makeSupabase() as never,
			url,
			cookies: makeCookies(),
			body: { response: credentialResponse },
		});
		expect(result).toMatchObject({ ok: false, status: 400 });
		expect(webauthn.verifyAuthenticationResponse).not.toHaveBeenCalled();
	});

	it("登録されていないパスキーは拒否する", async () => {
		setupAdmin();
		const table = makeTable({ maybeSingle: { data: null, error: null } });
		(admin.client as { from: ReturnType<typeof vi.fn> }).from = vi.fn(() => table);
		const result = await finishPasskeyLogin({
			supabase: makeSupabase() as never,
			url,
			cookies: loginCookies(),
			body: { response: credentialResponse },
		});
		expect(result).toMatchObject({ ok: false, status: 400 });
	});

	it("署名の検証に失敗したらセッションを発行しない", async () => {
		const { generateLink } = setupAdmin();
		webauthn.verifyAuthenticationResponse.mockRejectedValue(new Error("bad signature"));
		const supabase = makeSupabase();
		const result = await finishPasskeyLogin({
			supabase: supabase as never,
			url,
			cookies: loginCookies(),
			body: { response: credentialResponse },
		});
		expect(result).toMatchObject({ ok: false, status: 400 });
		expect(generateLink).not.toHaveBeenCalled();
		expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
	});

	it("検証を通ったらカウンタを更新し、そのユーザーのセッションを発行する", async () => {
		const { table, generateLink } = setupAdmin();
		webauthn.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 4 },
		});
		const supabase = makeSupabase();

		const result = await finishPasskeyLogin({
			supabase: supabase as never,
			url,
			cookies: loginCookies(),
			body: { response: credentialResponse },
		});

		expect(result).toEqual({ ok: true, data: { signedIn: true } });
		expect(webauthn.verifyAuthenticationResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedChallenge: "login-challenge",
				expectedRPID: "anipolis.example",
				credential: expect.objectContaining({ id: "cred-1", counter: 3 }),
				requireUserVerification: true,
			}),
		);
		expect(table["update"]).toHaveBeenCalledWith({ counter: 4, last_used_at: new Date(NOW).toISOString() });
		expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "u@example.com" });
		expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hashed" });
	});

	it("停止中のユーザーにはセッションを発行しない", async () => {
		const { generateLink } = setupAdmin({ bannedUntil: new Date(NOW + 60_000).toISOString() });
		webauthn.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 4 },
		});
		const result = await finishPasskeyLogin({
			supabase: makeSupabase() as never,
			url,
			cookies: loginCookies(),
			body: { response: credentialResponse },
		});
		expect(result).toMatchObject({ ok: false, status: 500 });
		expect(generateLink).not.toHaveBeenCalled();
	});

	it("β参加資格がなければログアウトさせる", async () => {
		beta.gate = true;
		beta.member = false;
		setupAdmin();
		webauthn.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 4 },
		});
		const supabase = makeSupabase();
		const result = await finishPasskeyLogin({
			supabase: supabase as never,
			url,
			cookies: loginCookies(),
			body: { response: credentialResponse },
		});
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(supabase.auth.signOut).toHaveBeenCalled();
	});
});
