import { getAnimeRankingTrending, getNotificationPage, getUnreadNotificationCount } from "#lib/server/queries.ts";
import { redirectToLogin } from "#lib/server/require-login.ts";
import { parseTimelineCursor } from "#lib/timeline-cursor.ts";
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
	// 50件ずつ。続きは ?before=…&before_id=… のカーソルで読む（#249）。
	// 形の違うカーソルは捨てて先頭のページを出す（PostgREST のフィルタに埋め込むので）
	const cursor = parseTimelineCursor(url.searchParams);
	const [notificationPage, unreadCount, trendingResult, animeTrending] = await Promise.all([
		getNotificationPage(supabase, user.id, { types: NOTIFICATION_TYPES, cursor }),
		getUnreadNotificationCount(supabase, user.id),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	return {
		notifications: notificationPage.notifications,
		nextCursor: notificationPage.nextCursor,
		isContinuation: cursor != null,
		unreadCount,
		trending: trendingResult.data ?? [],
		animeTrending,
	};
};
