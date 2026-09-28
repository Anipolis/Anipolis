import { fail, redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import {
	isInvalidNonceError,
	isReauthenticationRequiredError,
	isSamePasswordError,
	normalizeNonce,
} from "$lib/server/password-change";
import { isRateLimited } from "$lib/server/rate-limit";
import type { Actions, PageServerLoad } from "./$types";

const MIN_PASSWORD_LENGTH = 6;

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { hasEmailProvider: hasPasswordProvider(user, session) };
};

export const actions: Actions = {
	/**
	 * 再認証用の確認コードをメールで送る（secure_password_change 有効時の nonce 取得、#234）。
	 * OAuth 利用者の初回設定など、現在のパスワードで再サインインできない場合に使う。
	 */
	requestReauth: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		if (isRateLimited(`reauth-code:${user.id}`, 3, 15 * 60_000)) {
			return fail(429, { message: "確認コードの送信回数が多すぎます。しばらく待ってからお試しください" });
		}

		const { error } = await supabase.auth.reauthenticate();
		if (error) return fail(500, { message: "確認コードの送信に失敗しました" });

		return { reauthSent: true };
	},

	setPassword: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { session, user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const userHasEmailProvider = hasPasswordProvider(user, session);

		const form = await request.formData();
		const currentPassword = (form.get("current_password") as string | null) ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const confirm = (form.get("confirm") as string | null) ?? "";
		const nonce = normalizeNonce(form.get("nonce"));

		if (userHasEmailProvider) {
			if (!user.email) return fail(400, { message: "メールアドレスを確認できませんでした" });
			if (!currentPassword) {
				return fail(400, {
					field: "current_password",
					message: "現在のパスワードを入力してください",
				});
			}

			// セッションを奪われた場合の現在パスワード総当たり対策（ユーザー単位）。
			// form action は hooks の /api/* リミッターの対象外のためここで制限する
			if (isRateLimited(`set-password:${user.id}`, 5, 15 * 60_000)) {
				return fail(429, {
					field: "current_password",
					message: "試行回数が多すぎます。しばらく待ってからお試しください",
				});
			}

			const { error: signInError } = await supabase.auth.signInWithPassword({
				email: user.email,
				password: currentPassword,
			});
			if (signInError) {
				return fail(400, {
					field: "current_password",
					message: "現在のパスワードが正しくありません",
				});
			}
		}

		if (userHasEmailProvider && password === currentPassword) {
			return fail(400, {
				field: "password",
				message: "現在のパスワードと同じパスワードは設定できません",
			});
		}

		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				field: "password",
				message: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
			});
		}
		if (password !== confirm) {
			return fail(400, {
				field: "confirm",
				message: "パスワードが一致しません",
			});
		}

		// admin.updateUserById はセッションを無効化するが、updateUser はセッションを維持したまま更新できる。
		// secure_password_change 有効時、Auth は「24 時間以内に作られたセッション」か nonce を要求する。
		// メール/パスワード利用者は上の signInWithPassword で新しいセッションになっているので通る。
		// それ以外（OAuth の初回設定など）でセッションが古い場合は nonce が要る。
		const { error } = await supabase.auth.updateUser({
			password,
			...(nonce ? { nonce } : {}),
			data: { ...user.user_metadata, has_password: true },
		});
		if (error) {
			if (isSamePasswordError(error)) {
				return fail(400, {
					field: "password",
					message: "現在のパスワードと同じパスワードは設定できません",
				});
			}
			if (isInvalidNonceError(error)) {
				return fail(400, {
					field: "nonce",
					reauthRequired: true,
					message: "確認コードが正しくないか期限切れです。もう一度送信してください",
				});
			}
			if (isReauthenticationRequiredError(error)) {
				return fail(400, {
					field: "nonce",
					reauthRequired: true,
					message: "本人確認のため、メールで届く確認コードを入力してください",
				});
			}
			return fail(500, {
				message: userHasEmailProvider ? "パスワードの変更に失敗しました" : "パスワードの設定に失敗しました",
			});
		}

		return { success: true };
	},
};
