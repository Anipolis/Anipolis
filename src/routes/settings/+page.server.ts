import { redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import { getPendingFollowRequestCount } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const hasEmailProvider = hasPasswordProvider(user, session);
	const pendingFollowRequestCount = await getPendingFollowRequestCount(supabase, user.id);
	return { pendingFollowRequestCount, hasEmailProvider };
};
