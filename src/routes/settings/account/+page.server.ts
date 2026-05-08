import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return {};
};

export const actions: Actions = {
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
