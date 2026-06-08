import { randomInt } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ServerLoad } from "@sveltejs/kit";
import { generateDueBroadcastNotifications, markAllNotificationsRead } from "$lib/server/actions";
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

function isGoogleUser(user: User): boolean {
	const providers = user.app_metadata.providers;
	const providerList = typeof providers === "string" ? [providers] : Array.isArray(providers) ? providers : [];

	return (
		user.app_metadata.provider === "google" ||
		providerList.includes("google") ||
		user.identities?.some((identity) => identity.provider === "google") === true
	);
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
 * プロフィールを取得し、なければ Google メタデータから自動作成する
 */
async function getOrCreateProfile(supabase: SupabaseClient<Database>, user: User): Promise<Profile | null> {
	const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

	if (existing) return existing;

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
				display_name: metadata.full_name ?? username,
				avatar_url: metadata.avatar_url ?? null,
			},
			{ onConflict: "id" },
		)
		.select("*")
		.single();

	return created;
}

export const load: ServerLoad = async ({ locals: { supabase, safeGetSession }, cookies, depends, url }) => {
	depends("broadcast:notifications");
	const { session, user } = await safeGetSession();

	const profile = user ? await getOrCreateProfile(supabase, user) : null;
	if (user) await generateDueBroadcastNotifications(supabase);
	if (user && url.pathname === "/notifications") await markAllNotificationsRead(supabase, user.id);

	const [unreadNotificationCount, unreadBroadcastNotificationCount] = user
		? await Promise.all([
				getUnreadNotificationCount(supabase, user.id),
				getUnreadBroadcastNotificationCount(supabase, user.id),
			])
		: [0, 0];

	const pendingReportsCount = profile?.is_admin ? await getPendingReportsCount(supabase) : 0;

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

	return {
		session,
		user,
		profile,
		unreadNotificationCount,
		unreadBroadcastNotificationCount,
		pendingReportsCount,
		cookies: filteredCookies,
		extraAccounts,
	};
};
