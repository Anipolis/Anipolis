import type { Cookies } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

const secrets = vi.hoisted(() => ({
	env: { MULTI_ACCOUNT_COOKIE_SECRET: "unit-test-secret-value" } as Record<string, string>,
}));

vi.mock("$app/environment", () => ({ dev: true }));
vi.mock("$env/dynamic/private", () => secrets);
vi.mock("$env/dynamic/public", () => ({ env: {} }));
vi.mock("@simplewebauthn/server", () => ({}));
vi.mock("$lib/server/supabase-admin", () => ({ createServiceRoleClient: () => null }));
vi.mock("$lib/server/discord", () => ({ isBetaGateEnabled: () => false, isBetaMember: () => true }));

const { getCookieSigningSecret, signCookiePayload, verifyCookieSignature } = await import("./cookie-signing");
const { getInviteCodeCookie, setInviteCodeCookie } = await import("./invites");
const { getPasswordRecoveryUserId, setPasswordRecoveryCookie } = await import("./password-reset");
const { setChallengeCookie, takeChallengeCookie } = await import("./passkey");
const { getExtraAccounts, setExtraAccounts } = await import("./multi-account");

const SECRET = "unit-test-secret-value";
const INVITE = "anipolis_invite_code";
const RECOVERY = "anipolis_password_recovery";
const CHALLENGE = "anipolis_passkey_challenge";
const EXTRA = "anipolis_extra_accounts";

function makeCookies(): Cookies & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value),
		delete: (name: string) => void store.delete(name),
	} as unknown as Cookies & { store: Map<string, string> };
}

/** 署名付き Cookie（`<中身>.<署名>`）の署名の部分 */
const signatureOf = (cookie: string | undefined) => (cookie ?? "").slice((cookie ?? "").lastIndexOf(".") + 1);

describe("cookie signing", () => {
	it("同じ中身でも、用途が違えば別の署名になり、別の用途では検証に通らない", () => {
		const invite = signCookiePayload("invite-code", "ABCDEF1234", SECRET);
		expect(verifyCookieSignature("invite-code", "ABCDEF1234", invite, SECRET)).toBe(true);
		for (const purpose of ["password-recovery", "passkey-challenge", "extra-accounts"] as const) {
			expect(signCookiePayload(purpose, "ABCDEF1234", SECRET)).not.toBe(invite);
			expect(verifyCookieSignature(purpose, "ABCDEF1234", invite, SECRET)).toBe(false);
		}
		expect(verifyCookieSignature("invite-code", "ABCDEF1235", invite, SECRET)).toBe(false);
		expect(verifyCookieSignature("invite-code", "ABCDEF1234", "", SECRET)).toBe(false);
	});

	it("空文字の MULTI_ACCOUNT_COOKIE_SECRET は未設定として扱い、Supabase のシークレットにフォールバックする", () => {
		const original = { ...secrets.env };
		try {
			secrets.env["MULTI_ACCOUNT_COOKIE_SECRET"] = "";
			secrets.env["SUPABASE_SECRET_KEY"] = "sb-secret";
			expect(getCookieSigningSecret()).toBe("sb-secret");
			secrets.env["SUPABASE_SECRET_KEY"] = "";
			expect(getCookieSigningSecret()).toBe("");
		} finally {
			for (const key of Object.keys(secrets.env)) delete secrets.env[key];
			Object.assign(secrets.env, original);
		}
		expect(getCookieSigningSecret()).toBe(SECRET);
	});
});

describe("招待コードの Cookie を、別の Cookie の署名に使えない", () => {
	it("招待コードの Cookie は読み戻せる", () => {
		const cookies = makeCookies();
		setInviteCodeCookie(cookies, " abcDEF1234 ");
		expect(getInviteCodeCookie(cookies)).toBe("abcDEF1234");
	});

	it("招待コードの形でない入力には署名しない（別の Cookie の中身を署名させない）", () => {
		const recoveryPayload = "11111111-1111-4111-8111-111111111111.9999999999";
		const challengePayload = Buffer.from(
			JSON.stringify({ purpose: "login", challenge: "c", userId: null, expiresAt: 8_640_000_000_000_000 }),
		).toString("base64url");
		for (const input of [recoveryPayload, challengePayload, "a b", "a.b", "a\tb", "あいう", "x".repeat(33), ""]) {
			const cookies = makeCookies();
			cookies.store.set(INVITE, "stale.value");
			setInviteCodeCookie(cookies, input);
			expect(cookies.store.has(INVITE)).toBe(false);
		}
	});

	it("招待コード用の署名を付けた再設定の印・チャレンジ・連携アカウントは通らない", () => {
		const now = Date.UTC(2026, 10, 12);
		const userId = "11111111-1111-4111-8111-111111111111";

		// 本物の Cookie は通る
		const recovery = makeCookies();
		setPasswordRecoveryCookie(recovery, userId, now);
		expect(getPasswordRecoveryUserId(recovery, now)).toBe(userId);

		// 同じ中身に、招待コード用の署名・用途なしの署名（以前の形式）を付けたものは通らない
		const recoveryPayload = `${userId}.${Math.floor(now / 1000) + 600}`;
		const challengePayload = Buffer.from(
			JSON.stringify({ purpose: "login", challenge: "c", userId: null, expiresAt: now + 60_000 }),
		).toString("base64url");
		const accountsPayload = Buffer.from(
			JSON.stringify([
				{ userId, refreshToken: "t", profile: { username: "u", display_name: null, avatar_url: null } },
			]),
		).toString("base64url");
		const legacySign = async (payload: string) =>
			(await import("node:crypto")).createHmac("sha256", SECRET).update(payload).digest("base64url");

		const forged = makeCookies();
		forged.store.set(RECOVERY, `${recoveryPayload}.${signCookiePayload("invite-code", recoveryPayload, SECRET)}`);
		forged.store.set(
			CHALLENGE,
			`${challengePayload}.${signCookiePayload("invite-code", challengePayload, SECRET)}`,
		);
		forged.store.set(EXTRA, `${accountsPayload}.${signCookiePayload("invite-code", accountsPayload, SECRET)}`);
		expect(getPasswordRecoveryUserId(forged, now)).toBeNull();
		expect(takeChallengeCookie(forged, "login", now)).toBeNull();
		expect(getExtraAccounts(forged)).toEqual([]);

		return Promise.all([
			legacySign(recoveryPayload),
			legacySign(challengePayload),
			legacySign(accountsPayload),
		]).then(([recoverySig, challengeSig, accountsSig]) => {
			const legacy = makeCookies();
			legacy.store.set(RECOVERY, `${recoveryPayload}.${recoverySig}`);
			legacy.store.set(CHALLENGE, `${challengePayload}.${challengeSig}`);
			legacy.store.set(EXTRA, `${accountsPayload}.${accountsSig}`);
			expect(getPasswordRecoveryUserId(legacy, now)).toBeNull();
			expect(takeChallengeCookie(legacy, "login", now)).toBeNull();
			expect(getExtraAccounts(legacy)).toEqual([]);
		});
	});

	it("それぞれの Cookie は、自分の用途の署名で読み戻せる", () => {
		const now = Date.UTC(2026, 10, 12);
		const cookies = makeCookies();
		expect(setChallengeCookie(cookies, { purpose: "login", challenge: "c", userId: null }, now)).toBe(true);
		expect(signatureOf(cookies.store.get(CHALLENGE))).toBe(
			signCookiePayload("passkey-challenge", (cookies.store.get(CHALLENGE) ?? "").split(".")[0] ?? "", SECRET),
		);
		expect(takeChallengeCookie(cookies, "login", now)?.challenge).toBe("c");

		const account = {
			userId: "u1",
			refreshToken: "refresh.u1.token",
			profile: { username: "alice", display_name: null, avatar_url: null },
		};
		setExtraAccounts(cookies, [account]);
		expect(getExtraAccounts(cookies)).toEqual([account]);
	});
});
