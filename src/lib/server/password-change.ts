/**
 * パスワード変更の再認証まわり（GitHub #234）。
 *
 * Supabase Auth の secure_password_change を有効にすると、`updateUser({ password })` は
 * 「作成から 24 時間以内のセッション」か「`reauthenticate()` でメール送信した確認コード（nonce）」が
 * ないと `reauthentication_needed` で拒否される。画面のフォームを迂回して Auth API を直接
 * 呼ばれても、この検査は Auth 側で強制される。
 *
 * - メール/パスワード利用者: 現在のパスワードで signInWithPassword し直す。新しいセッションが
 *   作られるので、その直後の updateUser は再認証済みとして通る。
 * - OAuth 利用者の初回設定など: セッションが古ければ nonce が要求される。確認コードを送って
 *   入力してもらい、`updateUser({ password, nonce })` で通す。
 */

type AuthErrorLike = { code?: string | null | undefined; message?: string | null | undefined } | null | undefined;

/** Auth が「セッションが古いので再認証が必要」と答えた */
export function isReauthenticationRequiredError(error: AuthErrorLike): boolean {
	if (!error) return false;
	if (error.code === "reauthentication_needed") return true;
	return /reauthentication/i.test(error.message ?? "") && !isInvalidNonceError(error);
}

/** 入力された確認コードが違う・期限切れ */
export function isInvalidNonceError(error: AuthErrorLike): boolean {
	if (!error) return false;
	if (error.code === "reauthentication_not_valid") return true;
	return /nonce/i.test(error.message ?? "");
}

/** 新しいパスワードが現在のものと同じ */
export function isSamePasswordError(error: AuthErrorLike): boolean {
	if (!error) return false;
	if (error.code === "same_password") return true;
	const message = (error.message ?? "").toLowerCase();
	return (message.includes("same") || message.includes("different")) && message.includes("password");
}

/** メールで届く確認コードは数字 6 桁。前後の空白と全角数字だけ寛容に扱う */
export function normalizeNonce(raw: FormDataEntryValue | null): string {
	if (typeof raw !== "string") return "";
	return raw
		.trim()
		.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
		.replace(/\s+/g, "");
}
