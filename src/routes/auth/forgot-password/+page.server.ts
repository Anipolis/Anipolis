import { fail } from "@sveltejs/kit";
import { getClientKey, isRateLimited } from "$lib/server/rate-limit";
import {
	getPasswordResetRedirectTo,
	isPlausibleEmail,
	normalizeEmail,
	PASSWORD_RESET_REQUESTED_MESSAGE,
	withFixedDuration,
} from "$lib/utils/password-reset";
import type { Actions } from "./$types";

/** 登録の有無で応答時間が変わらないよう、申請の応答はいつもこの時間で返す */
const RESPONSE_MS = 800;

export const actions: Actions = {
	/**
	 * パスワード再設定メールの送信を申請する。
	 *
	 * アカウントの有無を漏らさないため、入力形式と頻度制限以外の理由では
	 * 常に同じ成功文言を返す。Supabase 側のエラー（未登録・送信頻度超過など）も
	 * ユーザーには見せずサーバーログにだけ残す。
	 */
	request: async (event) => {
		const {
			request,
			url,
			platform,
			locals: { supabase },
		} = event;
		const form = await request.formData();
		const email = normalizeEmail(form.get("email"));

		if (!isPlausibleEmail(email)) {
			return fail(400, { email, message: "メールアドレスを正しく入力してください" });
		}

		// メール爆撃・列挙対策（IP 単位）。form action は hooks の /api/* リミッターの対象外のためここで制限する
		if (isRateLimited(`auth-reset-request:${getClientKey(event)}`, 5, 15 * 60_000)) {
			return fail(429, { email, message: "申請回数が多すぎます。しばらく待ってからお試しください" });
		}

		// PKCE の code_verifier Cookie は送信リクエストの前に書かれるので、送信が応答に
		// 間に合わなくても再設定リンクは申請したブラウザで開ける
		await withFixedDuration(
			async () => {
				try {
					const { error } = await supabase.auth.resetPasswordForEmail(email, {
						redirectTo: getPasswordResetRedirectTo(url.origin),
					});
					// メールアドレスは記録しない（ログからの列挙防止）
					if (error)
						console.error("resetPasswordForEmail failed:", { status: error.status, code: error.code });
				} catch (error) {
					console.error("resetPasswordForEmail threw:", error instanceof Error ? error.name : "unknown");
				}
			},
			RESPONSE_MS,
			(promise) => platform?.ctx?.waitUntil(promise),
		);

		return { success: true, email: "", message: PASSWORD_RESET_REQUESTED_MESSAGE };
	},
};
