import { redirect } from "@sveltejs/kit";
import { markCategoryNotificationsRead, type NotificationCategory } from "$lib/server/actions";
import { getAnimeRankingTrending, getNotifications, getUnreadNotificationCountsByCategory } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

const NORMAL_TYPES = [
	"like",
	"repost",
	"reply",
	"mention",
	"follow",
	"follow_request",
	"anime_recommendation",
	"exchange_matched",
] as const;
const ROOM_TYPES = ["broadcast"] as const;
const MYLIST_TYPES = ["mylist_status"] as const;

function resolveTab(value: string | null): NotificationCategory {
	if (value === "room" || value === "mylist") return value;
	return "normal";
}

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, url, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	await parent();

	const tab = resolveTab(url.searchParams.get("tab"));

	// 表示中タブのカテゴリのみ既読にする（他タブの未読バッジは残す）
	await markCategoryNotificationsRead(supabase, user.id, tab);

	const [normal, room, mylist, unreadCounts, trendingResult, animeTrending] = await Promise.all([
		getNotifications(supabase, user.id, 50, NORMAL_TYPES),
		getNotifications(supabase, user.id, 50, ROOM_TYPES),
		getNotifications(supabase, user.id, 50, MYLIST_TYPES),
		getUnreadNotificationCountsByCategory(supabase, user.id),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	return {
		tab,
		notifications: { normal, room, mylist },
		unreadCounts,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};
