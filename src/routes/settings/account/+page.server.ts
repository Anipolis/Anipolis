import { fail, redirect } from "@sveltejs/kit";
import { setPasswordAction } from "$lib/server/actions";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const hasEmailProvider = user.identities?.some((id) => id.provider === "email") ?? false;

	return { hasEmailProvider };
};

export const actions: Actions = {
	setPassword: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { action: "setPassword", message: "ログインが必要です" });

		const hasEmailProvider = user.identities?.some((id) => id.provider === "email") ?? false;
		if (hasEmailProvider) {
			return fail(400, { action: "setPassword", message: "すでにパスワードが設定されています" });
		}

		const result = await setPasswordAction(request, supabase, user.id);
		if ("error" in result) {
			return fail(400, {
				action: "setPassword",
				field: result.field,
				message: result.error,
			});
		}

		return { action: "setPassword", success: true };
	},

	updateUsername: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const username = (form.get("username") as string | null)?.trim().toLowerCase() ?? "";

		if (!username) return fail(400, { field: "username", message: "ユーザー名を入力してください" });
		if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
			return fail(400, {
				field: "username",
				message: "ユーザー名は3〜20文字の半角英数字・アンダースコアのみ使用できます",
			});
		}

		const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);

		if (error) {
			if (error.code === "23505") {
				return fail(400, { field: "username", message: "このユーザー名はすでに使用されています" });
			}
			return fail(500, { message: "ユーザー名の更新に失敗しました" });
		}

		return { success: true };
	},
};
