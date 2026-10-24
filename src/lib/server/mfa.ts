import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";

/**
 * 二段階認証（認証アプリの 6 桁のコード、TOTP）。Supabase Auth の MFA を使う。
 *
 * - 管理者は二段階認証を済ませたログイン（aal2）でだけ管理者として扱う（isAdminUser・migration 177）
 * - 二段階認証を設定した人は、パスワードや Discord などでログインしたあと /auth/mfa でコードを入れる
 */

export type AssuranceLevel = "aal1" | "aal2" | null;

/**
 * 今のログインの確かさ（current）と、設定済みの認証で上げられる上限（next）。
 * current は getUser() で検証済みのアクセストークンから読む（hooks の safeGetSession の後で呼ぶ）
 */
export async function getAssuranceLevel(
	supabase: SupabaseClient<Database>,
): Promise<{ current: AssuranceLevel; next: AssuranceLevel }> {
	const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
	if (error || !data) return { current: null, next: null };
	return { current: toLevel(data.currentLevel), next: toLevel(data.nextLevel) };
}

function toLevel(value: string | null): AssuranceLevel {
	return value === "aal1" || value === "aal2" ? value : null;
}

/** 二段階認証を設定しているのに、まだコードを入れていないログインか */
export function needsMfaChallenge(level: { current: AssuranceLevel; next: AssuranceLevel }): boolean {
	return level.next === "aal2" && level.current !== "aal2";
}

/** 二段階認証を求めない画面（ログイン・コード入力・規約など）。ここ以外の画面はコードを入れるまで /auth/mfa に回す */
const MFA_EXEMPT_PREFIXES = ["/auth", "/terms", "/privacy-policy", "/data-sources", "/contact", "/api"];

export function isMfaExemptPath(pathname: string): boolean {
	return MFA_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** 6 桁のコード。全角数字や空白を入れても通す */
export function normalizeTotpCode(raw: FormDataEntryValue | null): string {
	return (typeof raw === "string" ? raw : "")
		.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
		.replace(/\s/g, "");
}

export function isTotpCodeShape(code: string): boolean {
	return /^\d{6}$/.test(code);
}
