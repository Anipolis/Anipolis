import { fail, redirect } from "@sveltejs/kit";
import { completeProfileSetupAction, skipProfileSetupAction } from "$lib/server/actions";
import type { Actions, PageServerLoad } from "./$types";

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

		const result = await completeProfileSetupAction(request, supabase, user.id);
		if ("error" in result) {
			return fail(result.status, {
				...result.values,
				...(result.field ? { field: result.field } : {}),
				message: result.error,
			});
		}

		redirect(303, "/");
	},

	skip: async ({ locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { username: "", display_name: "", message: "ログインが必要です" });

		const result = await skipProfileSetupAction(supabase, user.id);
		if ("error" in result) {
			return fail(500, { username: "", display_name: "", message: result.error });
		}

		redirect(303, "/");
	},
};
