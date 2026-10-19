import type { NotificationCategory } from "$lib/server/actions";
import { getNotifications, getUnreadNotificationCountsByCategory } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
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
	"activity_like",
] as const;
const ROOM_TYPES = ["broadcast"] as const;

function resolveTab(value: string | null): NotificationCategory {
	// 「マイリスト」のタブは 181 でなくした（フォロー中の人の動きはタイムラインのアクティビティへ）
	return value === "room" ? "room" : "normal";
}

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession }, url, parent }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	await parent();

	const tab = resolveTab(url.searchParams.get("tab"));

	// 既読化はここでは行わない。load は hover プリロードやブラウザの先読みでも走るため、
	// ここで書き込むとページを開いていなくても未読が消える（#242）。
	// 表示中タブの既読化は、描画後にページが POST /api/notifications/read を呼んで行う。

	// タブは通常リンク遷移で毎回 load が走るため、表示するタブの一覧だけ取得する
	// （非表示タブの分まで毎回50件×2カテゴリを取得しない）。未読バッジはカウント
	// クエリ（getUnreadNotificationCountsByCategory）だけで賄える。
	const typesByTab = { normal: NORMAL_TYPES, room: ROOM_TYPES } as const;
	const [activeList, unreadCounts] = await Promise.all([
		getNotifications(supabase, user.id, 50, typesByTab[tab]),
		getUnreadNotificationCountsByCategory(supabase, user.id),
	]);

	return {
		tab,
		notifications: { normal: [], room: [], [tab]: activeList },
		unreadCounts,
	};
};
