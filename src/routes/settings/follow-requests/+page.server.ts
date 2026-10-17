import { fail } from "@sveltejs/kit";
import { approveFollowRequestAction, rejectFollowRequestAction } from "$lib/server/actions";
import { getPendingFollowRequests } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	const requests = await getPendingFollowRequests(supabase, user.id).catch((err) => {
		console.error("[follow-requests] error:", err);
		return [] as Awaited<ReturnType<typeof getPendingFollowRequests>>;
	});

	return { requests };
};

export const actions: Actions = {
	approve: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return approveFollowRequestAction(request, supabase, user.id);
	},

	reject: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		return rejectFollowRequestAction(request, supabase, user.id);
	},
};
