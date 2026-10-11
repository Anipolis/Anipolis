import { fail, redirect } from "@sveltejs/kit";
import { unblockUserAction } from "$lib/server/actions";
import { getBlockedProfiles } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { blocked: await getBlockedProfiles(supabase, user.id) };
};

export const actions: Actions = {
	unblock: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return unblockUserAction(request, supabase, user.id);
	},
};
