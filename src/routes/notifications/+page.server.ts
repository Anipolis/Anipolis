import { redirect } from "@sveltejs/kit";
import { markAllNotificationsRead } from "$lib/server/actions";
import { getNotifications } from "$lib/server/queries";
import type { Notification } from "$lib/types";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	await parent();

	// ページ読み込み時に全通知を既読にする（必ず await する）
	await markAllNotificationsRead(supabase, user.id);

	const notifications = getNotifications(supabase, user.id).catch((err) => {
		console.error("[notifications] posts fetch error:", err);
		return [] as Notification[];
	});

	return { notifications };
};
