import { redirect } from "@sveltejs/kit";
import { markAllNotificationsRead } from "$lib/server/actions";
import { getNotifications } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	await parent();

	// ページ読み込み時に全通知を既読にする
	await markAllNotificationsRead(supabase, user.id);

	const notifications = await getNotifications(supabase, user.id);

	return { notifications };
};
