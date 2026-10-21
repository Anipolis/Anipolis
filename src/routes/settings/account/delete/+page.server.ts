import { fail, redirect } from "@sveltejs/kit";
import { checkDeletionGate, DELETE_REAUTH_WINDOW_MS, deleteAccount } from "$lib/server/account-deletion";
import { hasPasswordProvider } from "$lib/server/auth";
import { setExtraAccounts } from "$lib/server/multi-account";
import { redirectToLogin } from "$lib/server/require-login";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	return {
		hasEmailProvider: hasPasswordProvider(user, session),
		reauthWindowMinutes: DELETE_REAUTH_WINDOW_MS / 60_000,
	};
};

export const actions: Actions = {
	deleteAccount: async ({ request, cookies, locals: { supabase, safeGetSession } }) => {
		const { session, user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const confirmation = (form.get("confirmation") as string | null) ?? "";
		const currentPassword = (form.get("current_password") as string | null) ?? "";

		const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
		if (!profile) return fail(404, { message: "プロフィールが見つかりません" });

		const gate = checkDeletionGate({ user, session, username: profile.username, confirmation });
		if (!gate.ok) {
			if (gate.reason === "username_mismatch") {
				return fail(400, { field: "confirmation", message: "ユーザー名が一致しません" });
			}
			return fail(403, {
				message: `セキュリティのため、ログインし直してから退会してください（直近${DELETE_REAUTH_WINDOW_MS / 60_000}分以内のログインが必要です）`,
			});
		}

		if (gate.needsPassword) {
			if (!user.email) return fail(400, { message: "メールアドレスを確認できませんでした" });
			if (!currentPassword) {
				return fail(400, { field: "current_password", message: "現在のパスワードを入力してください" });
			}
			const { error: signInError } = await supabase.auth.signInWithPassword({
				email: user.email,
				password: currentPassword,
			});
			if (signInError) {
				return fail(400, { field: "current_password", message: "現在のパスワードが正しくありません" });
			}
		}

		const result = await deleteAccount(user.id, { initiatedBy: "self" });
		if (!result.ok) {
			if (result.reason === "has_room_experiments") {
				return fail(409, {
					message:
						"このアカウントに紐づく計測データが残っているため削除できませんでした。お問い合わせください",
				});
			}
			return fail(500, { message: "退会処理に失敗しました。時間をおいて試すか、お問い合わせください" });
		}

		// 切り替え用に保持している他アカウントのトークンも手元から消す
		setExtraAccounts(cookies, []);
		await supabase.auth.signOut();

		redirect(303, "/auth?deleted=1");
	},
};
