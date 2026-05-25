import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");
	return {};
};

export const actions: Actions = {
	updatePrivacy: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const isPrivate = form.get("is_private") === "on";

		const { error } = await supabase.from("profiles").update({ is_private: isPrivate }).eq("id", user.id);

		if (error) return fail(500, { message: "プライバシー設定の更新に失敗しました" });

		return { privacySuccess: true };
	},
};
