import { redirect } from "@sveltejs/kit";
import { getAdminDashboardData, isAdminUser } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const dashboard: Awaited<ReturnType<typeof getAdminDashboardData>> | null = await getAdminDashboardData(
		supabase,
	).catch((err) => {
		console.error("[admin] dashboard error:", err);
		return null;
	});

	return { dashboard };
};
