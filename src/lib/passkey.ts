import {
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";

export type PasskeyOutcome =
	| { ok: true; redirectTo: string | null }
	| { ok: false; message: string; reauthRequired: boolean };

type ApiResponse = { ok: boolean; body: Record<string, unknown> };

async function postJson(path: string, payload?: unknown): Promise<ApiResponse> {
	const res = await fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload ?? {}),
	});
	const body: unknown = await res.json().catch(() => ({}));
	return { ok: res.ok, body: body && typeof body === "object" ? (body as Record<string, unknown>) : {} };
}

function apiFailure(body: Record<string, unknown>, fallback: string): PasskeyOutcome {
	return {
		ok: false,
		message: typeof body["message"] === "string" ? body["message"] : fallback,
		reauthRequired: body["code"] === "reauth_required",
	};
}

/**
 * パスキーでログインする。成功するとサーバーがセッション Cookie を設定済みなので、
 * 呼び出し側は redirectTo へ invalidateAll 付きで遷移すればよい。
 */
export async function signInWithPasskey(next: string): Promise<PasskeyOutcome> {
	const fallback = passkeyErrorMessage(null, "login");
	try {
		const options = await postJson("/api/auth/passkey/authentication/options");
		if (!options.ok) return apiFailure(options.body, fallback);

		const optionsJSON = options.body as unknown as PublicKeyCredentialRequestOptionsJSON;
		const response = await startAuthentication({ optionsJSON });

		const verified = await postJson("/api/auth/passkey/authentication/verify", { response, next });
		if (!verified.ok) return apiFailure(verified.body, fallback);
		return {
			ok: true,
			redirectTo: typeof verified.body["redirectTo"] === "string" ? verified.body["redirectTo"] : "/",
		};
	} catch (error) {
		return { ok: false, message: passkeyErrorMessage(error, "login"), reauthRequired: false };
	}
}

/** ログイン中のユーザーにパスキーを追加する */
export async function registerPasskey(): Promise<PasskeyOutcome> {
	const fallback = passkeyErrorMessage(null, "register");
	try {
		const options = await postJson("/api/auth/passkey/registration/options");
		if (!options.ok) return apiFailure(options.body, fallback);

		const optionsJSON = options.body as unknown as PublicKeyCredentialCreationOptionsJSON;
		const response = await startRegistration({ optionsJSON });

		const verified = await postJson("/api/auth/passkey/registration/verify", { response });
		if (!verified.ok) return apiFailure(verified.body, fallback);
		return { ok: true, redirectTo: null };
	} catch (error) {
		return { ok: false, message: passkeyErrorMessage(error, "register"), reauthRequired: false };
	}
}

/** ブラウザ側（WebAuthn）で起きたエラーを利用者向けの文言にする */
export function passkeyErrorMessage(error: unknown, action: "login" | "register"): string {
	const { name, code, message } = (error && typeof error === "object" ? error : {}) as {
		name?: unknown;
		code?: unknown;
		message?: unknown;
	};
	// ダイアログを閉じた・タイムアウトした場合（ブラウザは区別せず NotAllowedError を返す）
	if (code === "ERROR_CEREMONY_ABORTED" || name === "NotAllowedError" || name === "AbortError") {
		return "パスキーの操作がキャンセルされたか、時間切れになりました";
	}
	if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
		return "このパスキーはすでに登録されています";
	}
	if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID") {
		return "このアドレスではパスキーを利用できません";
	}
	if (message === "WebAuthn is not supported in this browser") {
		return "このブラウザはパスキーに対応していません";
	}
	return action === "login" ? "パスキーでログインできませんでした" : "パスキーを登録できませんでした";
}
