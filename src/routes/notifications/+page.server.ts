import { getAnimeRankingTrending, getNotifications, getUnreadNotificationCount } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { PageServerLoad } from "./$types";

// 放送前のお知らせ（broadcast）は通知ではなくカレンダーに出す。
// 181 より前のマイリスト通知（mylist_status）も、もう出さない
const NOTIFICATION_TYPES = [
	"like",
	"repost",
	"reply",
	"mention",
	"follow",
	"follow_request",
	"anime_recommendation",
	"exchange_matched",
	"activity_like",
] as const;

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, url, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	await parent();

	// 既読化はここでは行わない。load は hover プリロードやブラウザの先読みでも走るため、
	// ここで書き込むとページを開いていなくても未読が消える（#242）。
	// 既読化は、描画後にページが POST /api/notifications/read を呼んで行う。
	const [notifications, unreadCount, trendingResult, animeTrending] = await Promise.all([
		getNotifications(supabase, user.id, 50, NOTIFICATION_TYPES),
		getUnreadNotificationCount(supabase, user.id),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	return {
		notifications,
		unreadCount,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};
