import { fail, redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import {
	clearPasswordRecoveryCookie,
	getPasswordRecoveryUserId,
	setPasswordRecoveryCookie,
} from "$lib/server/password-reset";
import { isRateLimited } from "$lib/server/rate-limit";
import {
	listSignInProviderLabels,
	PASSWORD_RESET_PATH,
	parseRecoveryLink,
	validateNewPassword,
} from "$lib/utils/password-reset";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 画面の状態。
 * - ready: リンク検証済みで、新パスワードを入力できる
 * - expired: Supabase が期限切れとして返してきたリンク
 * - invalid: 検証に失敗したリンク（改ざん・使用済み・申請と別ブラウザでの PKCE 交換失敗など）
 * - no_session: リンク経由の検証記録がない（直接アクセス・猶予切れ・設定済みリンクの再訪）
 * - oauth_only: パスワードを持たないアカウント（Google/X/Discord のみ）
 */
export type ResetPasswordState = "ready" | "expired" | "invalid" | "no_session" | "oauth_only";

export type ResetPasswordPageData = {
	state: ResetPasswordState;
	email: string | null;
	providers: string[];
};

function pageData(state: ResetPasswordState, extra: Partial<ResetPasswordPageData> = {}): ResetPasswordPageData {
	return { state, email: null, providers: [], ...extra };
}

export const load: PageServerLoad = async ({ url, cookies, locals: { supabase, safeGetSession } }) => {
	const link = parseRecoveryLink(url.searchParams);

	// メールのリンクから着地した場合はここでセッションを確立し、クエリを落とした
	// クリーンな URL に戻す（リロードで使用済みトークンを再送しないため）。
	if (link.kind === "token_hash" || link.kind === "code") {
		const { data, error } =
			link.kind === "token_hash"
				? await supabase.auth.verifyOtp({ type: "recovery", token_hash: link.tokenHash })
				: await supabase.auth.exchangeCodeForSession(link.code);

		if (error || !data.user) {
			// 別端末・別ブラウザで PKCE リンクを開いた場合もここに来る（code verifier が無い）
			console.error("Password recovery link verification failed:", { kind: link.kind, code: error?.code });
			return pageData("invalid");
		}

		setPasswordRecoveryCookie(cookies, data.user.id);
		redirect(303, PASSWORD_RESET_PATH);
	}

	if (link.kind === "error") return pageData(link.expired ? "expired" : "invalid");

	const { user, session } = await safeGetSession();
	const recoveryUserId = getPasswordRecoveryUserId(cookies);
	if (!user || recoveryUserId !== user.id) return pageData("no_session");

	// OAuth のみのアカウントにはパスワードを新設させず、利用中のログイン手段を案内する。
	// リンクで張られたセッションもここで破棄する（再設定フローはメール/パスワード利用者専用）。
	// 本人の他端末の OAuth セッションまで切らないよう local スコープに限定する。
	if (!hasPasswordProvider(user, session)) {
		clearPasswordRecoveryCookie(cookies);
		await supabase.auth.signOut({ scope: "local" });
		return pageData("oauth_only", {
			providers: listSignInProviderLabels(user.identities?.map((identity) => identity.provider) ?? []),
		});
	}

	return pageData("ready", { email: user.email ?? null });
};

export const actions: Actions = {
	setPassword: async ({ request, cookies, locals: { supabase, safeGetSession } }) => {
		const { user, session } = await safeGetSession();
		const recoveryUserId = getPasswordRecoveryUserId(cookies);
		if (!user || recoveryUserId !== user.id) {
			return fail(401, { message: "再設定リンクの有効期限が切れました。もう一度申請してください" });
		}
		if (!hasPasswordProvider(user, session)) {
			return fail(403, { message: "このアカウントはパスワードでのログインに対応していません" });
		}

		const form = await request.formData();
		const password = (form.get("password") as string | null) ?? "";
		const confirm = (form.get("confirm") as string | null) ?? "";

		const validation = validateNewPassword(password, confirm);
		if (!validation.ok) {
			return fail(400, { field: validation.field, message: validation.message });
		}

		// 同一リンクからの連打対策（ユーザー単位）
		if (isRateLimited(`auth-reset-set:${user.id}`, 5, 15 * 60_000)) {
			return fail(429, { message: "試行回数が多すぎます。しばらく待ってからお試しください" });
		}

		const { error } = await supabase.auth.updateUser({
			password,
			data: { ...user.user_metadata, has_password: true },
		});
		if (error) {
			const message = error.message.toLowerCase();
			if ((message.includes("same") || message.includes("different")) && message.includes("password")) {
				return fail(400, {
					field: "password",
					message: "以前と同じパスワードは設定できません",
				});
			}
			if (error.code === "weak_password") {
				return fail(400, { field: "password", message: "より推測されにくいパスワードを設定してください" });
			}
			console.error("updateUser(password) failed during recovery:", { userId: user.id, code: error.code });
			return fail(500, { message: "パスワードの再設定に失敗しました。しばらく経ってからお試しください" });
		}

		// リンクは使い切り扱いにする（同じセッションでの再設定は不可）
		clearPasswordRecoveryCookie(cookies);

		// 漏えいしたパスワードで張られた可能性のある他端末のセッションを切る（失敗しても再設定自体は成功）
		const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
		if (signOutError) console.error("signOut(others) after password reset failed:", { code: signOutError.code });

		return { success: true };
	},
};
