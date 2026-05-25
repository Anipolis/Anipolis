import { fail, redirect } from "@sveltejs/kit";
import { updateAccountModerationAction, updateReportStatusAction } from "$lib/server/actions";
import { getAdminDashboardData, isAdminUser } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const dashboard = await getAdminDashboardData(supabase).catch((err) => {
		console.error("[admin] dashboard error:", err);
		return null as unknown as Awaited<ReturnType<typeof getAdminDashboardData>>;
	});

	return { dashboard };
};

export const actions: Actions = {
	updateReportStatus: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const isAdmin = await isAdminUser(supabase, user.id);
		if (!isAdmin) return fail(403, { message: "管理者権限が必要です" });

		return updateReportStatusAction(request, supabase, user.id);
	},
	updateAccountModeration: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const isAdmin = await isAdminUser(supabase, user.id);
		if (!isAdmin) return fail(403, { message: "管理者権限が必要です" });

		return updateAccountModerationAction(request, supabase, user.id);
	},
};
