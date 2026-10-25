import type { User } from "@supabase/supabase-js";
import type { Cookies } from "@sveltejs/kit";

/**
 * この端末で前回ログインに使った方法（ログイン画面のボタンに「前回のログイン」と出す）。
 * ログイン画面の時点では誰なのか分からないので、アカウントではなく端末（Cookie）に覚える。
 * 中身は方法の名前だけで、メールアドレスなどは入れない。ログアウトしても消さない
 */
export const LAST_LOGIN_METHODS = ["discord", "google", "x", "email", "passkey"] as const;
export type LastLoginMethod = (typeof LAST_LOGIN_METHODS)[number];

const COOKIE_NAME = "anipolis_last_login";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function isLastLoginMethod(value: string | undefined): value is LastLoginMethod {
	return (LAST_LOGIN_METHODS as readonly string[]).includes(value ?? "");
}

export function getLastLoginMethod(cookies: Pick<Cookies, "get">): LastLoginMethod | null {
	const value = cookies.get(COOKIE_NAME);
	return isLastLoginMethod(value) ? value : null;
}

/** ログインに成功したときだけ呼ぶ（失敗した方法を「前回」として出さないため） */
export function setLastLoginMethod(cookies: Pick<Cookies, "set">, method: LastLoginMethod): void {
	cookies.set(COOKIE_NAME, method, { path: "/", httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR_SECONDS });
}

/**
 * 外部サービスから戻ってきたとき、どのサービスでログインしたか。
 * アカウントにつながっているサービスのうち、最後にログインした時刻がいちばん新しいもの
 */
export function detectOAuthLoginMethod(user: Pick<User, "identities">): LastLoginMethod | null {
	const latest = (user.identities ?? [])
		.filter((identity) => ["discord", "google", "twitter", "x"].includes(identity.provider))
		.sort((a, b) => Date.parse(b.last_sign_in_at ?? "") - Date.parse(a.last_sign_in_at ?? ""))[0];
	if (!latest) return null;
	// Supabase の X は provider 名が twitter と x の 2 通りある
	return latest.provider === "twitter" ? "x" : (latest.provider as LastLoginMethod);
}
