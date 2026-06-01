import { fail, redirect } from "@sveltejs/kit";
import { removeBroadcastRoomMute, upsertBroadcastRoomMute } from "$lib/server/actions";
import { getBroadcastRoomMutes } from "$lib/server/queries";
import type { BroadcastRoomMuteDuration } from "$lib/types";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { roomMutes: await getBroadcastRoomMutes(supabase, user.id) };
};

function toMuteDuration(value: FormDataEntryValue | null): BroadcastRoomMuteDuration | null {
	if (value === "event_end") return value;
	const days = Number(value);
	return days >= 1 && days <= 7 && Number.isInteger(days) ? (days as 1 | 2 | 3 | 4 | 5 | 6 | 7) : null;
}

export const actions: Actions = {
	updateRoomMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		const roomDate = (form.get("room_date") as string | null)?.trim() ?? "";
		const muteMode = form.get("mute_mode");
		const duration = muteMode === "event_end" ? "event_end" : toMuteDuration(form.get("duration_days"));
		const repeatWeekly = form.get("repeat_weekly") === "on";
		if (!duration) return fail(400, { message: "ミュート期間を選択してください" });

		return upsertBroadcastRoomMute(supabase, user.id, animeId, roomDate, duration, repeatWeekly);
	},

	removeRoomMute: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
		if (!animeId) return fail(400, { message: "ミュート設定が見つかりません" });
		return removeBroadcastRoomMute(supabase, user.id, animeId);
	},
};
