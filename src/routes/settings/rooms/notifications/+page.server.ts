import { fail, redirect } from "@sveltejs/kit";
import { updateBroadcastNotificationSettings } from "$lib/server/actions";
import { getBroadcastNotificationSettings } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { notificationSettings: await getBroadcastNotificationSettings(supabase, user.id) };
};

export const actions: Actions = {
	updateNotificationSettings: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		await updateBroadcastNotificationSettings(supabase, user.id, {
			notify_1min: form.get("notify_1min") === "on",
			notify_5min: form.get("notify_5min") === "on",
			notify_30min: form.get("notify_30min") === "on",
		});
		return { success: true };
	},
};
