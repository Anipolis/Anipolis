import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
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
 * Cookie 署名鍵。専用の MULTI_ACCOUNT_COOKIE_SECRET を優先し、未設定なら
 * サーバー専用の Supabase シークレットにフォールバックする（新規の必須環境変数を増やさない）。
 * どれも無ければ空文字を返し、その場合は署名 Cookie を発行・信用しない。
 */
function getSigningSecret(): string {
	return env["MULTI_ACCOUNT_COOKIE_SECRET"] ?? env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

function sign(payloadB64: string, secret: string): string {
	return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/**
 * 署名を定数時間で検証する。
 * 入力長に依存する早期 return を避けるため、期待値・入力値をそれぞれ再度 HMAC で
 * 固定長（32バイト）ダイジェスト化してから timingSafeEqual で比較する。
 */
function verify(payloadB64: string, signature: string, secret: string): boolean {
	const expectedDigest = createHmac("sha256", secret).update(sign(payloadB64, secret)).digest();
	const actualDigest = createHmac("sha256", secret).update(signature).digest();
	return timingSafeEqual(expectedDigest, actualDigest);
}

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

	const secret = getSigningSecret();
	if (!secret) return [];

	const dotIndex = raw.lastIndexOf(".");
	if (dotIndex <= 0) return [];
	const payloadB64 = raw.slice(0, dotIndex);
	const signature = raw.slice(dotIndex + 1);
	if (!verify(payloadB64, signature, secret)) return [];

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

	const secret = getSigningSecret();
	if (!secret) {
		// 署名鍵が無い環境では未署名でトークンを保存しない（多重アカウントが永続化されないだけ）
		console.error(
			"No signing secret configured (MULTI_ACCOUNT_COOKIE_SECRET / SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY); skipping extra-account cookie",
		);
		cookies.delete(COOKIE_NAME, { path: "/" });
		return;
	}

	const payloadB64 = Buffer.from(JSON.stringify(capped)).toString("base64url");
	cookies.set(COOKIE_NAME, `${payloadB64}.${sign(payloadB64, secret)}`, COOKIE_OPTS);
}
