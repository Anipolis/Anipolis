import { fail } from "@sveltejs/kit";
import { unblockUserAction } from "$lib/server/actions";
import { getBlockedProfiles } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	return { blocked: await getBlockedProfiles(supabase, user.id) };
};

export const actions: Actions = {
	unblock: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return unblockUserAction(request, supabase, user.id);
	},
};
