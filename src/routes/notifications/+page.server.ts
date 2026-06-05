import { redirect } from "@sveltejs/kit";
import { markAllNotificationsRead } from "$lib/server/actions";
import { getAnimeRankingTrending, getNotifications } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(302, "/");

	await parent();

	// ページ読み込み時に全通知を既読にする
	await markAllNotificationsRead(supabase, user.id);

	const [notifications, trendingResult, animeTrending] = await Promise.all([
		getNotifications(supabase, user.id),
		supabase.rpc("get_trending_hashtags", { limit_count: 10 }),
		getAnimeRankingTrending(supabase, 5),
	]);

	return { notifications, trending: trendingResult.data ?? [], animeTrending };
};
