import { fail, redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";

const MIN_PASSWORD_LENGTH = 6;

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { hasEmailProvider: hasPasswordProvider(user, session) };
};

export const actions: Actions = {
	setPassword: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { session, user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const userHasEmailProvider = hasPasswordProvider(user, session);

		const form = await request.formData();
		const currentPassword = (form.get("current_password") as string | null) ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const confirm = (form.get("confirm") as string | null) ?? "";

		if (userHasEmailProvider) {
			if (!user.email) return fail(400, { message: "メールアドレスを確認できませんでした" });
			if (!currentPassword) {
				return fail(400, {
					field: "current_password",
					message: "現在のパスワードを入力してください",
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

		// admin.updateUserById はセッションを無効化するが、updateUser はセッションを維持したまま更新できる
		const { error } = await supabase.auth.updateUser({
			password,
			data: { ...user.user_metadata, has_password: true },
		});
		if (error) {
			const message = error.message.toLowerCase();
			if ((message.includes("same") || message.includes("different")) && message.includes("password")) {
				return fail(400, {
					field: "password",
					message: "現在のパスワードと同じパスワードは設定できません",
				});
			}
			return fail(500, {
				message: userHasEmailProvider ? "パスワードの変更に失敗しました" : "パスワードの設定に失敗しました",
			});
		}

		return { success: true };
	},
};
