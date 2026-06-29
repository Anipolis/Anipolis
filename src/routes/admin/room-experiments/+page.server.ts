import { fail, redirect } from "@sveltejs/kit";
import { isAdminUser } from "$lib/server/queries";
import {
	getRoomExperimentDashboardData,
	startRoomExperimentRun,
	stopRoomExperimentRun,
} from "$lib/server/room-experiments";
import type { Actions, PageServerLoad } from "./$types";

function getTextField(form: FormData, name: string): { ok: true; value: string } | { ok: false } {
	const value = form.get(name);
	if (value == null) return { ok: true, value: "" };
	if (typeof value !== "string") return { ok: false };
	return { ok: true, value: value.trim() };
}

function parsePositiveInt(value: string): number | null {
	if (!/^\d+$/.test(value)) return null;
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

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
		const animeIdField = getTextField(form, "anime_id");
		const labelField = getTextField(form, "label");
		const notesField = getTextField(form, "notes");
		if (!animeIdField.ok || !labelField.ok || !notesField.ok) {
			return fail(400, { message: "フォーム値が不正です" });
		}
		const animeId = parsePositiveInt(animeIdField.value);
		if (!animeId) return fail(400, { message: "anime_idが不正です" });
		const label = labelField.value || null;
		const notes = notesField.value || null;
		const result = await startRoomExperimentRun(supabase, user.id, { animeId: String(animeId), label, notes });
		if (!result.ok) return fail(result.status, { message: result.message });
		return { success: true, message: "検証runを開始しました" };
	},

	stopRun: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const form = await request.formData();
		const runIdField = getTextField(form, "run_id");
		if (!runIdField.ok) return fail(400, { message: "フォーム値が不正です" });
		const runId = runIdField.value;
		if (!runId) return fail(400, { message: "run IDが不正です" });

		const result = await stopRoomExperimentRun(supabase, user.id, runId);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { success: true, message: "検証runを停止しました" };
	},
};
