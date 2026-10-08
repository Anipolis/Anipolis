import { error, fail, redirect } from "@sveltejs/kit";
import { hasPasswordProvider } from "$lib/server/auth";
import {
	deletePasskey,
	isPasskeyEnabled,
	isRecentlyAuthenticated,
	listPasskeys,
	PASSKEY_REAUTH_WINDOW_MS,
} from "$lib/server/passkey";
import { isRateLimited } from "$lib/server/rate-limit";
import type { Actions, PageServerLoad } from "./$types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ログインし直しに使える OAuth。action は /auth の form action 名
const REAUTH_PROVIDERS = [
	{ provider: "discord", action: "discord", label: "Discord" },
	{ provider: "google", action: "google", label: "Google" },
	{ provider: "x", action: "twitter", label: "X" },
	{ provider: "twitter", action: "twitter", label: "X" },
] as const;

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user, session } = await safeGetSession();
	if (!user) redirect(303, "/");
	if (!isPasskeyEnabled()) error(404, "Not Found");

	const linkedProviders = new Set(user.identities?.map((identity) => identity.provider));
	const reauthProviders = REAUTH_PROVIDERS.filter(({ provider }) => linkedProviders.has(provider))
		.map(({ action, label }) => ({ action, label }))
		.filter((item, index, list) => list.findIndex((other) => other.action === item.action) === index);

	const { passkeys, failed } = await listPasskeys(supabase, user.id);
	return {
		passkeys,
		loadFailed: failed,
		recentlyAuthenticated: isRecentlyAuthenticated(session),
		reauthWindowMinutes: PASSKEY_REAUTH_WINDOW_MS / 60_000,
		reauthProviders,
		hasEmailProvider: hasPasswordProvider(user, session),
	};
};

export const actions: Actions = {
	delete: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });

		const form = await request.formData();
		const passkeyId = (form.get("passkey_id") as string | null) ?? "";
		if (!UUID_PATTERN.test(passkeyId)) return fail(400, { message: "削除するパスキーが正しくありません" });

		if (!(await deletePasskey(supabase, user.id, passkeyId))) {
			return fail(500, { message: "パスキーの削除に失敗しました" });
		}
		return { deleted: true };
	},

	// パスワードを持つユーザーはその場でパスワードを確認し直せば、新しいセッションになる
	reauth: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: "ログインが必要です" });
		if (!user.email) return fail(400, { message: "メールアドレスを確認できませんでした" });

		const form = await request.formData();
		const password = (form.get("password") as string | null) ?? "";
		if (!password) return fail(400, { message: "パスワードを入力してください" });

		if (isRateLimited(`passkey-reauth:${user.id}`, 5, 10 * 60_000)) {
			return fail(429, { message: "試行回数が多すぎます。しばらく待ってからお試しください" });
		}

		const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password });
		if (signInError) return fail(400, { message: "パスワードが正しくありません" });

		return { reauthenticated: true };
	},
};
