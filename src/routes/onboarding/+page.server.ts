import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const MAX_DISPLAY_NAME_LENGTH = 50;

export const load: PageServerLoad = async ({ parent }) => {
	const { user, profile } = await parent();
	if (!user) redirect(303, "/auth");
	if (!profile) redirect(303, "/");
	// 既に初期設定済みなら通常画面へ
	if (profile.setup_completed) redirect(303, "/");

	return {
		username: profile.username,
		displayName: profile.display_name ?? "",
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { username: "", display_name: "", message: "ログインが必要です" });

		const form = await request.formData();
		const username = (form.get("username") as string | null)?.trim().toLowerCase() ?? "";
		const displayName = (form.get("display_name") as string | null)?.trim() ?? "";
		const values = { username, display_name: displayName };

		if (!USERNAME_PATTERN.test(username)) {
			return fail(400, {
				...values,
				field: "username",
				message: "ユーザー名は3〜20文字の半角英数字・アンダースコアのみ使用できます",
			});
		}

		if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
			return fail(400, {
				...values,
				field: "display_name",
				message: "表示名は50文字以内で入力してください",
			});
		}

		const { error } = await supabase
			.from("profiles")
			.update({ username, display_name: displayName || null, setup_completed: true })
			.eq("id", user.id);

		if (error) {
			if (error.code === "23505") {
				return fail(400, {
					...values,
					field: "username",
					message: "このユーザー名はすでに使用されています",
				});
			}
			return fail(500, { ...values, message: "保存に失敗しました。しばらく経ってから再試行してください" });
		}

		redirect(303, "/");
	},

	skip: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { username: "", display_name: "", message: "ログインが必要です" });

		const { error } = await supabase.from("profiles").update({ setup_completed: true }).eq("id", user.id);

		if (error) {
			return fail(500, { username: "", display_name: "", message: "スキップに失敗しました" });
		}

		redirect(303, "/");
	},
};
