import type { ServerLoad } from "@sveltejs/kit";
import { error, redirect } from "@sveltejs/kit";
import { getExtraAccounts, setExtraAccounts } from "$lib/server/multi-account";
import {
	getPendingReportsCount,
	getProfileById,
	getUnreadBroadcastNotificationCount,
	getUnreadNotificationCount,
} from "$lib/server/queries";
import type { StoredAccount } from "$lib/types";

// 初回オンボーディング誘導を免除するパス（オンボーディング画面自身と認証フロー）
const ONBOARDING_EXEMPT_PREFIXES = ["/onboarding", "/auth"];

function isOnboardingExempt(pathname: string): boolean {
	return ONBOARDING_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const load: ServerLoad = async ({ locals: { supabase, safeGetSession }, cookies, url, depends }) => {
	// クライアント側で認証状態が変わった（例：メール確認リンク着地時のハッシュ
	// トークン検出）ときに invalidate("supabase:auth") でこの load ごと再実行し、
	// session / profile を再取得できるようにする。宣言がないと +layout.ts しか
	// 再実行されず、ここで計算した古い session が使い回されてしまう。
	depends("supabase:auth");
	const { session, user } = await safeGetSession();

	const { data: profile, error: profileError } = user
		? await getProfileById(supabase, user.id)
		: { data: null, error: null };

	if (profileError) {
		error(500, "プロフィールの取得に失敗しました");
	}

	// プロフィールがまだない OAuth ユーザーは、公開プロフィールを作成する前に
	// オンボーディングで名前とアイコンを確認してもらう。
	if (user && !profile && !isOnboardingExempt(url.pathname)) {
		const next = `${url.pathname}${url.search}`;
		redirect(303, `/onboarding?next=${encodeURIComponent(next)}`);
	}

	// 放送通知の生成は migration 070 の pg_cron ジョブ（毎分）に移行済み
	// 通知の既読化は /notifications ページの load でタブ（カテゴリ）単位に行う

	const filteredCookies = cookies.getAll().filter(({ name }) => /^sb-.+-auth-token/.test(name));
	const storedExtraAccounts = getExtraAccounts(cookies);
	let extraAccounts: StoredAccount[] = [];

	if (!user) {
		if (storedExtraAccounts.length > 0) setExtraAccounts(cookies, []);
	} else {
		const nonSelfExtraAccounts = storedExtraAccounts.filter((account) => account.userId !== user.id);
		extraAccounts = nonSelfExtraAccounts;

		if (nonSelfExtraAccounts.length > 0) {
			const linkedUserIds = [...new Set(nonSelfExtraAccounts.map((account) => account.userId))];
			// biome-ignore lint/suspicious/noExplicitAny: linked_accounts not yet in auto-generated DB types
			const { data: links, error: linksError } = await (supabase as any)
				.from("linked_accounts")
				.select("linked_user_id")
				.eq("owner_user_id", user.id)
				.in("linked_user_id", linkedUserIds);

			if (!linksError) {
				const validLinkedUserIds = new Set(
					(links ?? [])
						.map((link: { linked_user_id?: unknown }) => link.linked_user_id)
						.filter((id: unknown): id is string => typeof id === "string"),
				);
				extraAccounts = nonSelfExtraAccounts.filter((account) => validLinkedUserIds.has(account.userId));
			}
		}

		if (
			extraAccounts.length !== storedExtraAccounts.length ||
			extraAccounts.some((account, index) => account.userId !== storedExtraAccounts[index]?.userId)
		) {
			setExtraAccounts(cookies, extraAccounts);
		}
	}

	// ── 通知カウントを deferred Promise として返す ─────────────────
	// await せずに Promise のまま返すことで SvelteKit のストリーミング機能を
	// 利用し、子ルートの load（page.server.ts）が parent() を await した際に
	// これらのカウント取得を待たずに開始できるようにする。
	// バッジ表示はページコンテンツより後から描画されてよい副次情報のため
	// ストリーミングが適切。
	return {
		session,
		user,
		profile,
		cookies: filteredCookies,
		unreadNotificationCount: user ? getUnreadNotificationCount(supabase, user.id) : Promise.resolve(0),
		unreadBroadcastNotificationCount: user
			? getUnreadBroadcastNotificationCount(supabase, user.id)
			: Promise.resolve(0),
		pendingReportsCount: profile?.is_admin ? getPendingReportsCount(supabase) : Promise.resolve(0),
		extraAccounts,
	};
};
