import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "$env/dynamic/private";

/**
 * 署名付き Cookie の用途。署名の入力に混ぜて、用途ごとに別の署名になるようにする。
 *
 * 以前は 4 つの Cookie が同じ鍵で「中身だけ」に署名していた。招待コードは利用者が入力した文字列を
 * そのまま署名して Cookie に返すので、招待コードの欄に別の Cookie の中身（パスワード再設定の印や
 * パスキーのチャレンジ）を入れると、その Cookie として通る署名が手に入った。
 * 用途を混ぜておけば、ある用途で作った署名は別の用途では検証に通らない。
 */
export type SignedCookiePurpose = "invite-code" | "password-recovery" | "passkey-challenge" | "extra-accounts";

/**
 * Cookie 署名鍵。専用の MULTI_ACCOUNT_COOKIE_SECRET を優先し、未設定なら
 * サーバー専用の Supabase シークレットにフォールバックする（新規の必須環境変数を増やさない）。
 * どれも無ければ空文字を返し、その場合は署名 Cookie を発行・信用しない。
 * 空文字で設定されている場合（.env.example の `MULTI_ACCOUNT_COOKIE_SECRET=` のまま）も未設定として扱う。
 */
export function getCookieSigningSecret(): string {
	return env["MULTI_ACCOUNT_COOKIE_SECRET"] || env["SUPABASE_SECRET_KEY"] || env["SUPABASE_SERVICE_ROLE_KEY"] || "";
}

/** 用途と中身に署名する。用途は固定の文字列で NUL を含まないので、区切りの NUL で中身と混ざらない */
export function signCookiePayload(purpose: SignedCookiePurpose, payload: string, secret: string): string {
	return createHmac("sha256", secret).update(`${purpose}\0${payload}`).digest("base64url");
}

/**
 * 署名を定数時間で検証する。
 * 入力長に依存する早期 return を避けるため、期待値・入力値をそれぞれ再度 HMAC で
 * 固定長（32バイト）ダイジェスト化してから timingSafeEqual で比較する。
 */
export function verifyCookieSignature(
	purpose: SignedCookiePurpose,
	payload: string,
	signature: string,
	secret: string,
): boolean {
	const expectedDigest = createHmac("sha256", secret)
		.update(signCookiePayload(purpose, payload, secret))
		.digest();
	const actualDigest = createHmac("sha256", secret).update(signature).digest();
	return expectedDigest.length === actualDigest.length && timingSafeEqual(expectedDigest, actualDigest);
}
