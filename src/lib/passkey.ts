type PasskeyError = { name?: string; code?: string | undefined; message?: string; cause?: unknown };

function causeName(error: PasskeyError): string | undefined {
	const cause = error.cause;
	return cause && typeof cause === "object" && "name" in cause && typeof cause.name === "string"
		? cause.name
		: undefined;
}

/**
 * signInWithPasskey / registerPasskey のエラーを利用者向けの文言にする。
 * WebAuthn 側のエラー（WebAuthnError）と Supabase Auth 側のエラー（AuthError）の両方を受ける。
 */
export function passkeyErrorMessage(error: PasskeyError, action: "login" | "register"): string {
	// ユーザーがダイアログを閉じた・タイムアウトした場合（ブラウザは区別せず NotAllowedError を返す）
	if (error.code === "ERROR_CEREMONY_ABORTED" || causeName(error) === "NotAllowedError") {
		return "パスキーの操作がキャンセルされたか、時間切れになりました";
	}
	if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
		return "このパスキーはすでに登録されています";
	}
	if (error.code === "ERROR_INVALID_DOMAIN" || error.code === "ERROR_INVALID_RP_ID") {
		return "このアドレスではパスキーを利用できません";
	}
	if (error.message === "Browser does not support WebAuthn") {
		return "このブラウザはパスキーに対応していません";
	}
	if (error.code === "over_request_rate_limit") {
		return "試行回数が多すぎます。しばらく待ってからお試しください";
	}
	return action === "login" ? "パスキーでログインできませんでした" : "パスキーを登録できませんでした";
}
