import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getCookieSigningSecret, signCookiePayload, verifyCookieSignature } from "$lib/server/cookie-signing";
import type { StoredAccount } from "$lib/types";

const COOKIE_NAME = "anipolis_extra_accounts";
const COOKIE_OPTS = {
	httpOnly: true,
	secure: !dev,
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60 * 24 * 7,
};

/**
 * 署名付き Cookie から追加アカウントを取り出す。
 *
 * Cookie 値は `<base64url(JSON)>.<HMAC-SHA256 署名>` 形式。改ざん・偽造された値、
 * および署名鍵未設定時は空配列を返す（未署名データは信用しない）。
 * リフレッシュトークンを平文で持つため、Cookie 窃取時の被害面を抑える目的での署名検証。
 * 呼び出し側（api/account-switch）は DB の linked_accounts でも別途リンクを検証している。
 */
export function getExtraAccounts(cookies: Cookies): StoredAccount[] {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return [];

	const secret = getCookieSigningSecret();
	if (!secret) return [];

	const dotIndex = raw.lastIndexOf(".");
	if (dotIndex <= 0) return [];
	const payloadB64 = raw.slice(0, dotIndex);
	const signature = raw.slice(dotIndex + 1);
	if (!verifyCookieSignature("extra-accounts", payloadB64, signature, secret)) return [];

	try {
		const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(a): a is StoredAccount =>
				typeof a?.userId === "string" &&
				typeof a?.refreshToken === "string" &&
				typeof a?.profile?.username === "string",
		);
	} catch {
		return [];
	}
}

export function setExtraAccounts(cookies: Cookies, accounts: StoredAccount[]): void {
	const capped = accounts.slice(0, 2);
	if (capped.length === 0) {
		cookies.delete(COOKIE_NAME, { path: "/" });
		return;
	}

	const secret = getCookieSigningSecret();
	if (!secret) {
		// 署名鍵が無い環境では未署名でトークンを保存しない（多重アカウントが永続化されないだけ）
		console.error(
			"No signing secret configured (MULTI_ACCOUNT_COOKIE_SECRET / SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY); skipping extra-account cookie",
		);
		cookies.delete(COOKIE_NAME, { path: "/" });
		return;
	}

	const payloadB64 = Buffer.from(JSON.stringify(capped)).toString("base64url");
	cookies.set(COOKIE_NAME, `${payloadB64}.${signCookiePayload("extra-accounts", payloadB64, secret)}`, COOKIE_OPTS);
}
