import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ServerLoad } from "@sveltejs/kit";
import { getExtraAccounts } from "$lib/server/multi-account";
import { getPendingFollowRequestCount, getUnreadNotificationCount } from "$lib/server/queries";
import type { Database } from "$lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * プロフィールを取得し、なければ Google メタデータから自動作成する
 */
async function getOrCreateProfile(supabase: SupabaseClient<Database>, user: User): Promise<Profile | null> {
	const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

	if (existing) return existing;

	const metadata = user.user_metadata as {
		user_name?: string;
		full_name?: string | null;
		avatar_url?: string | null;
	};

	// Google ログイン後にトリガーが未実行の場合に備えて手動作成
	const rawBase =
		(metadata.user_name || user.email?.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 14) ||
		"user";

	// user.id の先頭5文字を付けて一意性を保証
	const username = `${rawBase}_${user.id.slice(0, 5)}`;

	const { data: created } = await supabase
		.from("profiles")
		.upsert(
			{
				id: user.id,
				username,
				display_name: metadata.full_name ?? null,
				avatar_url: metadata.avatar_url ?? null,
			},
			{ onConflict: "id" },
		)
		.select("*")
		.single();

	return created;
}

export const load: ServerLoad = async ({ locals: { supabase, safeGetSession }, cookies }) => {
	const { session, user } = await safeGetSession();

	const profile = user ? await getOrCreateProfile(supabase, user) : null;

	const filteredCookies = cookies.getAll().filter(({ name }) => /^sb-.+-auth-token/.test(name));
	const extraAccounts = user ? getExtraAccounts(cookies) : [];

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
		pendingFollowRequestCount: user ? getPendingFollowRequestCount(supabase, user.id) : Promise.resolve(0),
		extraAccounts,
	};
};
