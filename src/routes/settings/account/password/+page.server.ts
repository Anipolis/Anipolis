import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

const MIN_PASSWORD_LENGTH = 6;

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const hasEmailProvider = user.identities?.some((id) => id.provider === "email") ?? false;
	if (hasEmailProvider) redirect(303, "/settings");

	return {};
};

export const actions: Actions = {
	setPassword: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const hasEmailProvider = user.identities?.some((id) => id.provider === "email") ?? false;
		if (hasEmailProvider) {
			return fail(400, { message: "すでにパスワードが設定されています" });
		}

		const form = await request.formData();
		const password = (form.get("password") as string | null) ?? "";
		const confirm = (form.get("confirm") as string | null) ?? "";

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
		const { error } = await supabase.auth.updateUser({ password });
		if (error) {
			return fail(500, { message: "パスワードの設定に失敗しました" });
		}

		return { success: true };
	},
};
