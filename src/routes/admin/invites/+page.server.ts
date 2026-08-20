import { fail, redirect } from "@sveltejs/kit";
import { revokeInviteAction } from "$lib/server/actions";
import { getInvitesWithCreators, isAdminUser } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const invites = await getInvitesWithCreators(supabase);
	return { invites };
};

export const actions: Actions = {
	revoke: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { inviteMessage: "ログインが必要です" });

		const isAdmin = await isAdminUser(supabase, user.id);
		if (!isAdmin) return fail(403, { inviteMessage: "管理者権限が必要です" });

		return revokeInviteAction(request, supabase, user.id);
	},
};
