import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getCookieSigningSecret, signCookiePayload, verifyCookieSignature } from "$lib/server/cookie-signing";
import type { Database } from "$lib/supabase/database.types";

const inviteRedeemErrorMessages = {
	INVITE_INVALID: "招待コードが無効です",
	INVITE_EXPIRED: "招待コードの有効期限が切れています",
	INVITE_EXHAUSTED: "招待コードは使用上限に達しています",
} as const;

export type InviteRedeemErrorDetail = keyof typeof inviteRedeemErrorMessages;

export function getInviteRedeemErrorDetail(error: { details?: unknown }): InviteRedeemErrorDetail | null {
	return typeof error.details === "string" && error.details in inviteRedeemErrorMessages
		? (error.details as InviteRedeemErrorDetail)
		: null;
}

export function inviteRedeemErrorMessage(detail: InviteRedeemErrorDetail): string {
	return inviteRedeemErrorMessages[detail];
}

/**
 * コードの正当性だけを（消費せずに）確認する。未ログイン状態からも呼べる
 * （anon にも EXECUTE を許可済み）。招待リンクのプリフィル・事前バリデーション用。
 */
export async function validateInviteCode(supabase: SupabaseClient<Database>, code: string): Promise<boolean> {
	const normalized = code.trim();
	if (!normalized) return false;

	const { data, error } = await supabase.rpc("check_invite_code", { p_code: normalized });
	if (error) {
		console.error("check_invite_code error:", error);
		return false;
	}
	return data === true;
}

export type RedeemInviteResult = { success: true } | { success: false; detail: InviteRedeemErrorDetail | null };

/**
 * 招待コードを消費する。成功したら呼び出し元で app_metadata.beta_member を
 * service role で付与すること（このRPC自体はDBの帳簿付けのみ行う）。
 */
export async function redeemInviteCode(supabase: SupabaseClient<Database>, code: string): Promise<RedeemInviteResult> {
	const normalized = code.trim();
	if (!normalized) return { success: false, detail: "INVITE_INVALID" };

	const { error } = await supabase.rpc("redeem_invite", { p_code: normalized });
	if (error) {
		return { success: false, detail: getInviteRedeemErrorDetail(error) };
	}
	return { success: true };
}

// ----------------------------------------------------------------
// 招待コードを OAuth のリダイレクト往復を挟んでも持ち越すための
// 署名付き httpOnly Cookie。署名は cookie-signing.ts（用途ごとに別の署名）。
// ----------------------------------------------------------------

const INVITE_COOKIE_NAME = "anipolis_invite_code";
const INVITE_COOKIE_OPTS = {
	httpOnly: true,
	secure: !dev,
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60, // 1時間。OAuthの往復とその場の手入力が持てば十分
};

/**
 * Cookie に持ち越してよい招待コードの形。入力はまだ検証していない文字列なので、
 * 招待コードとしてありえないものは署名しない。発行するコードは英数字 10 文字
 * （migration 116 の create_invite）で、照合は大文字・小文字を区別しない。
 */
const INVITE_CODE_COOKIE_PATTERN = /^[0-9A-Za-z]{1,32}$/;

/** 招待コードを署名付き Cookie に保存する。空文字・コードの形でない値なら Cookie を消すだけ。 */
export function setInviteCodeCookie(cookies: Cookies, code: string): void {
	const normalized = code.trim();
	if (!INVITE_CODE_COOKIE_PATTERN.test(normalized)) {
		cookies.delete(INVITE_COOKIE_NAME, { path: "/" });
		return;
	}

	const secret = getCookieSigningSecret();
	if (!secret) {
		console.error("No signing secret configured for invite code cookie; skipping");
		return;
	}

	cookies.set(
		INVITE_COOKIE_NAME,
		`${normalized}.${signCookiePayload("invite-code", normalized, secret)}`,
		INVITE_COOKIE_OPTS,
	);
}

/** 署名付き Cookie から招待コードを取り出す。改ざん・未署名時は null。 */
export function getInviteCodeCookie(cookies: Cookies): string | null {
	const raw = cookies.get(INVITE_COOKIE_NAME);
	if (!raw) return null;

	const secret = getCookieSigningSecret();
	if (!secret) return null;

	const dotIndex = raw.lastIndexOf(".");
	if (dotIndex <= 0) return null;
	const code = raw.slice(0, dotIndex);
	const signature = raw.slice(dotIndex + 1);
	return verifyCookieSignature("invite-code", code, signature, secret) ? code : null;
}

export function clearInviteCodeCookie(cookies: Cookies): void {
	cookies.delete(INVITE_COOKIE_NAME, { path: "/" });
}
