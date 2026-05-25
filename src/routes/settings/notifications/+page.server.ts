import { fail, redirect } from "@sveltejs/kit";
import { updateNotificationSettingsAction } from "$lib/server/actions";
import { getBroadcastNotificationSettings } from "$lib/server/queries";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	const notificationSettings = await getBroadcastNotificationSettings(supabase, user.id);
	return { notificationSettings };
};

export const actions: Actions = {
	updateNotificationSettings: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		await updateNotificationSettingsAction(request, supabase, user.id);
		return { success: true };
	},
};
