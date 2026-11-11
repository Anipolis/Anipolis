import { describe, expect, it } from "vitest";
import { getLastSignInAt } from "./auth";

type AuthSession = Parameters<typeof getLastSignInAt>[0];

function sessionWithAmr(amr: { method?: string; timestamp?: unknown }[]): AuthSession {
	const encoded = Buffer.from(JSON.stringify({ amr }), "utf8").toString("base64url");
	return { access_token: `header.${encoded}.signature` } as unknown as AuthSession;
}

const LOGIN = 1_794_000_000;
const LATER = LOGIN + 3 * 24 * 60 * 60;

describe("getLastSignInAt", () => {
	it("1要素目の確認のうち、いちばん新しい時刻を返す", () => {
		expect(getLastSignInAt(sessionWithAmr([{ method: "oauth", timestamp: LOGIN }]))).toBe(LOGIN * 1000);
		expect(
			getLastSignInAt(
				sessionWithAmr([
					{ method: "oauth", timestamp: LOGIN },
					{ method: "password", timestamp: LATER },
				]),
			),
		).toBe(LATER * 1000);
		// パスキーのログイン・メールのリンクは Supabase Auth では otp / magiclink / recovery になる
		for (const method of ["otp", "magiclink", "recovery", "sso/saml"]) {
			expect(getLastSignInAt(sessionWithAmr([{ method, timestamp: LATER }]))).toBe(LATER * 1000);
		}
	});

	it("2要素目の確認とトークンの更新は、ログインし直した時刻に数えない", () => {
		// ログイン中のセッションがあれば、TOTP は自分で登録して確認まで済ませられる
		for (const method of ["totp", "mfa/phone", "mfa/webauthn", "token_refresh"]) {
			expect(
				getLastSignInAt(
					sessionWithAmr([
						{ method: "oauth", timestamp: LOGIN },
						{ method, timestamp: LATER },
					]),
				),
			).toBe(LOGIN * 1000);
			expect(getLastSignInAt(sessionWithAmr([{ method, timestamp: LATER }]))).toBeNull();
		}
	});

	it("方法や時刻が読めない amr は数えない", () => {
		expect(getLastSignInAt(sessionWithAmr([{ timestamp: LATER }]))).toBeNull();
		expect(getLastSignInAt(sessionWithAmr([{ method: "oauth", timestamp: "now" }]))).toBeNull();
		expect(getLastSignInAt(sessionWithAmr([]))).toBeNull();
		expect(getLastSignInAt(null)).toBeNull();
		expect(getLastSignInAt({ access_token: "no.payload" } as unknown as AuthSession)).toBeNull();
	});
});
