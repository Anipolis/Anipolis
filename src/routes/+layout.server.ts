import { randomInt } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ServerLoad } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { markAllNotificationsRead } from "$lib/server/actions";
import { getExtraAccounts, setExtraAccounts } from "$lib/server/multi-account";
import {
	getPendingReportsCount,
	getUnreadBroadcastNotificationCount,
	getUnreadNotificationCount,
} from "$lib/server/queries";
import type { Database } from "$lib/supabase/database.types";
import type { StoredAccount } from "$lib/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const RANDOM_USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const RANDOM_USERNAME_LENGTH = 7;

// 初回オンボーディング誘導を免除するパス（オンボーディング画面自身と認証フロー）
const ONBOARDING_EXEMPT_PREFIXES = ["/onboarding", "/auth"];

function isGoogleUser(user: User): boolean {
	const providers = user.app_metadata.providers;
	const providerList = typeof providers === "string" ? [providers] : Array.isArray(providers) ? providers : [];

	return (
		user.app_metadata.provider === "google" ||
		providerList.includes("google") ||
		user.identities?.some((identity) => identity.provider === "google") === true
	);
}

function isDiscordUser(user: User): boolean {
	const providers = user.app_metadata.providers;
	const providerList = typeof providers === "string" ? [providers] : Array.isArray(providers) ? providers : [];

	return (
		user.app_metadata.provider === "discord" ||
		providerList.includes("discord") ||
		user.identities?.some((identity) => identity.provider === "discord") === true
	);
}

function isOnboardingExempt(pathname: string): boolean {
	return ONBOARDING_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function generateRandomUsername(): string {
	let suffix = "";

	for (let i = 0; i < RANDOM_USERNAME_LENGTH; i += 1) {
		suffix += RANDOM_USERNAME_CHARS[randomInt(RANDOM_USERNAME_CHARS.length)];
	}

	return `user${suffix}`;
}

async function generateAvailableRandomUsername(supabase: SupabaseClient<Database>): Promise<string> {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const username = generateRandomUsername();
		const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();

		if (!existing) return username;
	}

	return `user${Date.now().toString(36).slice(-7)}`;
}

/**
 * プロフィールを取得し、なければプロバイダのメタデータから自動作成する
 */
async function getOrCreateProfile(supabase: SupabaseClient<Database>, user: User): Promise<Profile | null> {
	const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

	if (existing) return existing;

	// Google: 匿名ランダムハンドル（トリガー 063 と同等のフォールバック）
	if (isGoogleUser(user)) {
		const username = await generateAvailableRandomUsername(supabase);
		const { data: created } = await supabase
			.from("profiles")
			.upsert(
				{
					id: user.id,
					username,
					display_name: username,
					avatar_url: (user.user_metadata?.["avatar_url"] as string | null | undefined) ?? null,
					setup_completed: false,
				},
				{ onConflict: "id" },
			)
			.select("*")
			.single();

		return created;
	}

	const metadata = user.user_metadata as {
		user_name?: string;
		full_name?: string | null;
		avatar_url?: string | null;
	};

	// Discord / メールユーザーでトリガーが未実行の場合のフォールバック。
	// Discord の username（一意）とニックネーム（full_name）をそのまま使う。
	const isDiscord = isDiscordUser(user);
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
				display_name: metadata.full_name ?? username,
				avatar_url: metadata.avatar_url ?? null,
				// Discord は onboarding で確認・編集、メール登録は確定済み
				setup_completed: !isDiscord,
			},
			{ onConflict: "id" },
		)
		.select("*")
		.single();

	return created;
}

export const load: ServerLoad = async ({ locals: { supabase, safeGetSession }, cookies, url }) => {
	const { session, user } = await safeGetSession();

	const profile = user ? await getOrCreateProfile(supabase, user) : null;

	// 初回オンボーディング誘導：外部 OAuth で作られたランダムユーザー名のままの
	// ユーザーを設定画面へ誘導する。免除パス（/onboarding・/auth）以外で発火。
	if (profile && profile.setup_completed === false && !isOnboardingExempt(url.pathname)) {
		redirect(303, "/onboarding");
	}

	// 放送通知の生成は migration 070 の pg_cron ジョブ（毎分）に移行済み
	if (user && url.pathname === "/notifications") await markAllNotificationsRead(supabase, user.id);

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
