import { error, json } from "@sveltejs/kit";
import { getExtraAccounts, setExtraAccounts } from "$lib/server/multi-account";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies, locals: { supabase, safeGetSession } }) => {
	const { user: currentUser, session: currentSession } = await safeGetSession();
	if (!currentUser || !currentSession) {
		error(401, "ログインが必要です");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, "リクエスト形式が不正です");
	}

	const bodyRecord = body as Record<string, unknown>;
	const targetUserId = typeof bodyRecord["userId"] === "string" ? (bodyRecord["userId"] as string) : null;

	if (!targetUserId) error(400, "userId が必要です");

	const extraAccounts = getExtraAccounts(cookies);
	const targetAccount = extraAccounts.find((a) => a.userId === targetUserId);
	if (!targetAccount) error(404, "ACCOUNT_NOT_IN_COOKIE");

	// Cookie 偽造対策: DB でリンクの存在を確認
	// biome-ignore lint/suspicious/noExplicitAny: linked_accounts not yet in auto-generated DB types
	const { data: link } = await (supabase as any)
		.from("linked_accounts")
		.select("owner_user_id")
		.eq("owner_user_id", currentUser.id)
		.eq("linked_user_id", targetUserId)
		.maybeSingle();

	if (!link) error(403, "LINK_NOT_FOUND");

	const currentRefreshToken = currentSession.refresh_token;

	// 対象アカウントのセッションに切り替え
	const { data: newSessionData, error: refreshError } = await supabase.auth.refreshSession({
		refresh_token: targetAccount.refreshToken,
	});

	if (refreshError || !newSessionData.session) {
		// 期限切れ — Cookie から削除してクライアントに通知
		setExtraAccounts(
			cookies,
			extraAccounts.filter((a) => a.userId !== targetUserId),
		);
		error(400, "REFRESH_EXPIRED");
	}

	// 現在のユーザーのプロフィールを取得して Cookie に保存
	const { data: currentProfile } = await supabase
		.from("profiles")
		.select("username, display_name, avatar_url")
		.eq("id", currentUser.id)
		.single();

	setExtraAccounts(cookies, [
		...extraAccounts.filter((a) => a.userId !== targetUserId),
		{
			userId: currentUser.id,
			refreshToken: currentRefreshToken,
			profile: {
				username: currentProfile?.username ?? "",
				display_name: currentProfile?.display_name ?? null,
				avatar_url: currentProfile?.avatar_url ?? null,
			},
		},
	]);

	return json({ success: true });
};
