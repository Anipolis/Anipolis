import { fail, redirect } from "@sveltejs/kit";
import { createInviteAction, revokeInviteAction } from "$lib/server/actions";
import { getInvites } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const invites = await getInvites(supabase, user.id);
	return { invites };
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { inviteMessage: "ログインが必要です" });

		return createInviteAction(request, supabase, user.id);
	},

	revoke: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { inviteMessage: "ログインが必要です" });

		return revokeInviteAction(request, supabase, user.id);
	},
};
