import { fail, redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";

async function verifyCurrentPassword(
	supabase: App.Locals["supabase"],
	user: NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>,
	session: NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"]> | null,
	currentPassword: string,
) {
	if (!hasPasswordProvider(user, session)) return null;
	if (!user.email) return "メールアドレスを確認できませんでした";
	if (!currentPassword) return "現在のパスワードを入力してください";

	const { error } = await supabase.auth.signInWithPassword({
		email: user.email,
		password: currentPassword,
	});
	if (error) return "現在のパスワードが正しくありません";

	return null;
}

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirect(303, "/");
	return { hasEmailProvider: hasPasswordProvider(user, session) };
};

export const actions: Actions = {
	updateUsername: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { session, user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const username = (form.get("username") as string | null)?.trim().toLowerCase() ?? "";
		const currentPassword = (form.get("current_password") as string | null) ?? "";

		if (!username) return fail(400, { field: "username", message: "ユーザー名を入力してください" });
		if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
			return fail(400, {
				field: "username",
				message: "ユーザー名は3〜20文字の半角英数字・アンダースコアのみ使用できます",
			});
		}

		const passwordError = await verifyCurrentPassword(supabase, user, session, currentPassword);
		if (passwordError) {
			return fail(400, { field: "current_password", message: passwordError });
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
