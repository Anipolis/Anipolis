import { json } from "@sveltejs/kit";
import { getActiveRoomReminders, getUnreadNotificationCount } from "$lib/server/queries";
import type { RequestHandler } from "./$types";

/** layout が30秒ごとに読む。通知の未読数と、放送前のお知らせ（カレンダーの点と小さな表示に使う） */
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ unreadNotificationCount: 0, roomReminders: [] });
	}

	const [unreadNotificationCount, roomReminders] = await Promise.all([
		getUnreadNotificationCount(supabase, user.id),
		getActiveRoomReminders(supabase, user.id),
	]);

	return json({ unreadNotificationCount, roomReminders });
};
