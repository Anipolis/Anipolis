/**
 * パスワード再設定フローの純粋ヘルパー。
 * Supabase やリクエスト文脈に依存しない判定・整形だけをここに置き、
 * /auth/forgot-password（申請）と /auth/reset-password（新パスワード設定）の両方から使う。
 */

export const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const PASSWORD_RESET_PATH = "/auth/reset-password";

/** 登録時（/auth の register）と同じ最小文字数 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * 申請フォームの応答文言。アカウントの有無にかかわらず常にこの1種類を返し、
 * 文言からメールアドレスの登録有無を推測できないようにする。
 */
export const PASSWORD_RESET_REQUESTED_MESSAGE =
	"入力されたメールアドレスで登録があれば、パスワード再設定用のメールを送信しました。届かない場合は迷惑メールフォルダもご確認ください";

export function normalizeEmail(raw: FormDataEntryValue | string | null | undefined): string {
	return (typeof raw === "string" ? raw : "").trim().toLowerCase();
}

/**
 * ざっくりした形式チェック。厳密な RFC 準拠ではなく、明らかな入力ミスと
 * 過剰に長い値を Supabase へ送る前に弾く目的。
 */
export function isPlausibleEmail(email: string): boolean {
	if (email.length === 0 || email.length > 254) return false;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type NewPasswordValidation = { ok: true } | { ok: false; field: "password" | "confirm"; message: string };

export function validateNewPassword(password: string, confirm: string): NewPasswordValidation {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return {
			ok: false,
			field: "password",
			message: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
		};
	}
	if (password !== confirm) {
		return { ok: false, field: "confirm", message: "パスワードが一致しません" };
	}
	return { ok: true };
}

/** 再設定メールのリンク着地先（Supabase Dashboard の Redirect URLs にも登録が必要） */
export function getPasswordResetRedirectTo(origin: string): string {
	return `${origin}${PASSWORD_RESET_PATH}`;
}

export type RecoveryLink =
	/** メールテンプレートを token_hash 方式にした場合（別端末・別ブラウザでも開ける） */
	| { kind: "token_hash"; tokenHash: string }
	/** 既定テンプレート（PKCE）。申請したブラウザで開いた場合のみ交換できる */
	| { kind: "code"; code: string }
	/** Supabase 側で検証に失敗し、エラーを付けてリダイレクトされてきた */
	| { kind: "error"; expired: boolean }
	/** リンク由来のパラメータなし（通常表示・フォーム送信後の再描画） */
	| { kind: "none" };

/**
 * 再設定リンク着地時のクエリを分類する。
 * Supabase は期限切れ・使用済みリンクを
 * `?error=access_denied&error_code=otp_expired` の形で返してくる。
 */
export function parseRecoveryLink(params: URLSearchParams): RecoveryLink {
	const tokenHash = params.get("token_hash")?.trim() ?? "";
	const type = params.get("type");
	if (tokenHash && type === "recovery") return { kind: "token_hash", tokenHash };

	const code = params.get("code")?.trim() ?? "";
	if (code) return { kind: "code", code };

	const errorCode = params.get("error_code");
	if (params.get("error") || errorCode) {
		return { kind: "error", expired: errorCode === "otp_expired" };
	}

	return { kind: "none" };
}

const PROVIDER_LABELS: Record<string, string> = {
	google: "Google",
	discord: "Discord",
	twitter: "X",
	x: "X",
};

/**
 * パスワードを持たないアカウントに案内するための、利用中ログイン手段の表示名。
 * email は除外し、重複は畳む（identities の順序は保つ）。
 */
export function listSignInProviderLabels(providers: readonly string[]): string[] {
	const labels: string[] = [];
	for (const provider of providers) {
		if (provider === "email") continue;
		const label = PROVIDER_LABELS[provider] ?? provider;
		if (!labels.includes(label)) labels.push(label);
	}
	return labels;
}

/**
 * 処理時間の下限を揃える。
 * 登録済みメールにはメール送信が走り、未登録なら即応答という時間差から
 * アカウントの有無を推測されないよう、最低でも minMs は待ってから返す。
 */
export async function withMinimumDuration<T>(task: () => Promise<T>, minMs: number): Promise<T> {
	const startedAt = Date.now();
	const result = await task();
	const remaining = minMs - (Date.now() - startedAt);
	if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
	return result;
}
