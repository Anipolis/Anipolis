import { redirect } from "@sveltejs/kit";
import { countPendingCopyrightReviews } from "$lib/server/copyright-reviews";
import { getAdminDashboardData, isAdminUser } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const dashboard: Awaited<ReturnType<typeof getAdminDashboardData>> | null = await getAdminDashboardData(
		supabase,
	).catch((err) => {
		console.error("[admin] dashboard error:", err);
		return null;
	});

	const copyrightReviewCounts = await countPendingCopyrightReviews(supabase);
	const pendingCopyrightReviews = Object.values(copyrightReviewCounts).reduce((sum, count) => sum + count, 0);

	return { dashboard, pendingCopyrightReviews };
};
