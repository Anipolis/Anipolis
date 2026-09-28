import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";

// ----------------------------------------------------------------
// パスワード再設定リンクの検証に成功したことを示す短命の署名付き httpOnly Cookie。
//
// 再設定リンクを踏むと Supabase の通常セッションが張られるため、セッションの
// 有無だけでは「リンク経由で来た」ことを区別できない。この Cookie を
// /auth/reset-password の新パスワード設定の前提条件にすることで、
// 単にログイン済みのセッション（乗っ取り含む）から現在のパスワードなしで
// 変更できる抜け道にならないようにする。
// 署名は invites.ts / multi-account.ts と同じ HMAC パターン。
// ----------------------------------------------------------------

const RECOVERY_COOKIE_NAME = "anipolis_password_recovery";
/** リンク検証から新パスワード設定までの猶予。ページを開いたまま放置された場合の上限 */
const RECOVERY_TTL_SECONDS = 15 * 60;

const RECOVERY_COOKIE_OPTS = {
	httpOnly: true,
	secure: !dev,
	sameSite: "lax" as const,
	path: "/",
	maxAge: RECOVERY_TTL_SECONDS,
};

function getSigningSecret(): string {
	return env["MULTI_ACCOUNT_COOKIE_SECRET"] ?? env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verify(payload: string, signature: string, secret: string): boolean {
	const expectedDigest = createHmac("sha256", secret).update(sign(payload, secret)).digest();
	const actualDigest = createHmac("sha256", secret).update(signature).digest();
	return expectedDigest.length === actualDigest.length && timingSafeEqual(expectedDigest, actualDigest);
}

/** リンク検証に成功したユーザー ID を有効期限付きで記録する */
export function setPasswordRecoveryCookie(cookies: Cookies, userId: string, now = Date.now()): void {
	const secret = getSigningSecret();
	if (!secret) {
		console.error("No signing secret configured for password recovery cookie; skipping");
		return;
	}
	const expiresAt = Math.floor(now / 1000) + RECOVERY_TTL_SECONDS;
	const payload = `${userId}.${expiresAt}`;
	cookies.set(RECOVERY_COOKIE_NAME, `${payload}.${sign(payload, secret)}`, RECOVERY_COOKIE_OPTS);
}

/** 署名と期限が有効なら記録されたユーザー ID を返す。改ざん・期限切れ・未設定は null */
export function getPasswordRecoveryUserId(cookies: Cookies, now = Date.now()): string | null {
	const raw = cookies.get(RECOVERY_COOKIE_NAME);
	if (!raw) return null;

	const secret = getSigningSecret();
	if (!secret) return null;

	const [userId, expiresAtRaw, signature, ...rest] = raw.split(".");
	if (!userId || !expiresAtRaw || !signature || rest.length > 0) return null;
	if (!verify(`${userId}.${expiresAtRaw}`, signature, secret)) return null;

	const expiresAt = Number(expiresAtRaw);
	if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now) return null;

	return userId;
}

export function clearPasswordRecoveryCookie(cookies: Cookies): void {
	cookies.delete(RECOVERY_COOKIE_NAME, { path: "/" });
}
