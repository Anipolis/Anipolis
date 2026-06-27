import { fail, redirect } from "@sveltejs/kit";
import { isAdminUser } from "$lib/server/queries";
import {
	getRoomExperimentDashboardData,
	startRoomExperimentRun,
	stopRoomExperimentRun,
} from "$lib/server/room-experiments";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	const isAdmin = await isAdminUser(supabase, user.id);
	if (!isAdmin) redirect(302, "/");

	const query = url.searchParams.get("q")?.trim() ?? "";
	const dashboard = await getRoomExperimentDashboardData(supabase, query);
	return { dashboard, query };
};

export const actions: Actions = {
	startRun: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const label = (form.get("label") as string | null)?.trim() || null;
		const notes = (form.get("notes") as string | null)?.trim() || null;
		const result = await startRoomExperimentRun(supabase, user.id, { animeId, label, notes });
		if (!result.ok) return fail(result.status, { message: result.message });
		return { success: true, message: "検証runを開始しました" };
	},

	stopRun: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const form = await request.formData();
		const runId = (form.get("run_id") as string | null)?.trim() ?? "";
		if (!runId) return fail(400, { message: "run IDが不正です" });

		const result = await stopRoomExperimentRun(supabase, user.id, runId);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { success: true, message: "検証runを停止しました" };
	},
};
