import { json } from "@sveltejs/kit";
import { getUnreadBroadcastNotificationCount, getUnreadNotificationCount } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ unreadNotificationCount: 0, unreadBroadcastNotificationCount: 0 });
	}

	const [unreadNotificationCount, unreadBroadcastNotificationCount] = await Promise.all([
		getUnreadNotificationCount(supabase, user.id),
		getUnreadBroadcastNotificationCount(supabase, user.id),
	]);

	return json({ unreadNotificationCount, unreadBroadcastNotificationCount });
};
