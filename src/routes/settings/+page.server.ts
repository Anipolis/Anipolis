import { redirect } from "@sveltejs/kit";
import { getPendingFollowRequestCount } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const pendingFollowRequestCount = await getPendingFollowRequestCount(supabase, user.id);
	return { pendingFollowRequestCount };
};
