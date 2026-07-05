import { fail, redirect } from "@sveltejs/kit";
import { isAdminUser } from "$lib/server/queries";
import {
	getRoomExperimentDashboardData,
	searchRoomExperimentEvents,
	startRoomExperimentRun,
	stopRoomExperimentRun,
} from "$lib/server/room-experiments";
import type { Actions, PageServerLoad } from "./$types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	const target = url.searchParams.get("target") === "event" ? "event" : "anime";
	const [dashboard, eventSearchResults] = await Promise.all([
		getRoomExperimentDashboardData(supabase, query),
		searchRoomExperimentEvents(supabase, query),
	]);
	return { dashboard, eventSearchResults, query, target };
};

export const actions: Actions = {
	startRun: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!(await isAdminUser(supabase, user.id))) return fail(403, { message: "管理者権限が必要です" });

		const form = await request.formData();
		const animeIdField = getTextField(form, "anime_id");
		const eventIdField = getTextField(form, "event_id");
		const labelField = getTextField(form, "label");
		const notesField = getTextField(form, "notes");
		if (!animeIdField.ok || !eventIdField.ok || !labelField.ok || !notesField.ok) {
			return fail(400, { message: "フォーム値が不正です" });
		}
		const label = labelField.value || null;
		const notes = notesField.value || null;

		const hasAnimeId = animeIdField.value !== "";
		const hasEventId = eventIdField.value !== "";
		if (hasAnimeId === hasEventId) {
			return fail(400, { message: "対象を1つ指定してください" });
		}

		if (hasAnimeId) {
			const animeId = parsePositiveInt(animeIdField.value);
			if (!animeId) return fail(400, { message: "anime_idが不正です" });
			const result = await startRoomExperimentRun(supabase, user.id, { kind: "episode", animeId, label, notes });
			if (!result.ok) return fail(result.status, { message: result.message });
			return { success: true, message: "検証runを開始しました" };
		}

		if (!UUID_RE.test(eventIdField.value)) return fail(400, { message: "event_idが不正です" });
		const result = await startRoomExperimentRun(supabase, user.id, {
			kind: "event",
			eventId: eventIdField.value,
			label,
			notes,
		});
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
