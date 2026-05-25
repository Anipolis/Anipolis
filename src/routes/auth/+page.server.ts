import { fail, redirect } from "@sveltejs/kit";
import { linkAccounts } from "$lib/server/actions";
import { getExtraAccounts, setExtraAccounts } from "$lib/server/multi-account";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Actions, PageServerLoad } from "./$types";

const MIN_PASSWORD_LENGTH = 6;

function getSafeNext(raw: FormDataEntryValue | string | null): string {
	const next = typeof raw === "string" ? raw : "/";
	return next.startsWith("/") && !next.startsWith("//") && !next.includes(":/") ? next : "/";
}

function normalizeUsername(value: FormDataEntryValue | null): string {
	return (typeof value === "string" ? value : "").trim().toLowerCase();
}

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	const next = getSafeNext(url.searchParams.get("next"));
	const rawMode = url.searchParams.get("mode");
	const mode = rawMode === "register" ? "register" : rawMode === "add_account" ? "add_account" : "login";

	// add_account はログイン済みユーザーのみアクセス可
	if (mode === "add_account" && !user) redirect(303, "/auth?mode=login");
	// login/register はログイン済みならリダイレクト
	if (mode !== "add_account" && user) redirect(303, next);

	return { mode, next };
};

export const actions: Actions = {
	login: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const email = (form.get("email") as string | null)?.trim() ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const next = getSafeNext(form.get("next"));

		if (!email || !password) {
			return fail(400, { mode: "login", email, message: "メールアドレスとパスワードを入力してください" });
		}

		const { error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, {
				mode: "login",
				email,
				message: "メールアドレスまたはパスワードが正しくありません",
			});
		}

		redirect(303, next);
	},

	register: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const email = (form.get("email") as string | null)?.trim() ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const username = normalizeUsername(form.get("username"));
		const displayName = (form.get("display_name") as string | null)?.trim() ?? "";
		const next = getSafeNext(form.get("next"));

		const values = { email, username, display_name: displayName };

		if (!email || !password || !username) {
			return fail(400, {
				mode: "register",
				...values,
				message: "メールアドレス、パスワード、ユーザー名を入力してください",
			});
		}

		if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
			return fail(400, {
				mode: "register",
				...values,
				field: "username",
				message: "ユーザー名は3〜20文字の半角英数字とアンダースコアのみ使えます",
			});
		}

		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				mode: "register",
				...values,
				field: "password",
				message: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
			});
		}

		const { data: existingProfile } = await supabase
			.from("profiles")
			.select("id")
			.eq("username", username)
			.maybeSingle();

		if (existingProfile) {
			return fail(400, {
				mode: "register",
				...values,
				field: "username",
				message: "このユーザー名はすでに使われています",
			});
		}

		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					user_name: username,
					full_name: displayName || username,
				},
			},
		});

		if (error) {
			return fail(400, {
				mode: "register",
				...values,
				message: error.message.includes("already registered")
					? "このメールアドレスはすでに登録されています"
					: "アカウント作成に失敗しました。入力内容を確認してください",
			});
		}

		if (data.session) redirect(303, next);

		return {
			mode: "register",
			success: true,
			message: "確認メールを送信しました。メール内のリンクから登録を完了してください",
		};
	},

	addAccount: async ({ request, cookies, locals: { supabase, safeGetSession } }) => {
		const { user: ownerUser, session: ownerSession } = await safeGetSession();
		if (!ownerUser || !ownerSession) {
			return fail(401, { mode: "add_account", message: "ログインが必要です" });
		}

		const form = await request.formData();
		const email = (form.get("email") as string | null)?.trim() ?? "";
		const password = (form.get("password") as string | null) ?? "";

		if (!email || !password) {
			return fail(400, {
				mode: "add_account",
				message: "メールアドレスとパスワードを入力してください",
			});
		}

		// 既存リンク数チェック（追加アカウントは最大2）
		// biome-ignore lint/suspicious/noExplicitAny: linked_accounts not yet in auto-generated DB types
		const { count } = await (supabase as any)
			.from("linked_accounts")
			.select("*", { count: "exact", head: true })
			.eq("owner_user_id", ownerUser.id);

		if ((count ?? 0) >= 2) {
			return fail(400, {
				mode: "add_account",
				message: "アカウントは最大3つまで追加できます",
			});
		}

		// アカウント A の refresh_token を保持してからアカウント B でログイン
		const ownerRefreshToken = ownerSession.refresh_token;

		const { data: targetData, error: signInError } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (signInError || !targetData.session) {
			// ログイン失敗 — アカウント A のセッションを復元
			await supabase.auth.refreshSession({ refresh_token: ownerRefreshToken });
			return fail(400, {
				mode: "add_account",
				message: "メールアドレスまたはパスワードが正しくありません",
			});
		}

		const targetUserId = targetData.user.id;
		const targetRefreshToken = targetData.session.refresh_token;

		if (targetUserId === ownerUser.id) {
			await supabase.auth.refreshSession({ refresh_token: ownerRefreshToken });
			return fail(400, { mode: "add_account", message: "自分のアカウントは追加できません" });
		}

		// 既にリンク済みかチェック（B のセッションで owner=A のリンクは見えないので service role 使用）
		const serviceClient = createServiceRoleClient();
		// biome-ignore lint/suspicious/noExplicitAny: linked_accounts not yet in auto-generated DB types
		const { data: existingLink } = await (serviceClient as any)
			.from("linked_accounts")
			.select("owner_user_id")
			.eq("owner_user_id", ownerUser.id)
			.eq("linked_user_id", targetUserId)
			.maybeSingle();

		if (existingLink) {
			await supabase.auth.refreshSession({ refresh_token: ownerRefreshToken });
			return fail(400, { mode: "add_account", message: "このアカウントはすでに追加されています" });
		}

		// アカウント B のプロフィールを取得
		const { data: targetProfile } = await supabase
			.from("profiles")
			.select("username, display_name, avatar_url")
			.eq("id", targetUserId)
			.single();

		// アカウント A のセッションを復元
		const { error: restoreError } = await supabase.auth.refreshSession({
			refresh_token: ownerRefreshToken,
		});

		if (restoreError) {
			redirect(303, "/auth?mode=login");
		}

		// DB にリンクを記録（双方向）
		await linkAccounts(serviceClient, ownerUser.id, targetUserId, count ?? 0);

		// Cookie にアカウント B を保存
		const existing = getExtraAccounts(cookies);
		setExtraAccounts(cookies, [
			...existing.filter((a) => a.userId !== targetUserId),
			{
				userId: targetUserId,
				refreshToken: targetRefreshToken,
				profile: {
					username: targetProfile?.username ?? "",
					display_name: targetProfile?.display_name ?? null,
					avatar_url: targetProfile?.avatar_url ?? null,
				},
			},
		]);

		redirect(303, "/");
	},

	google: async ({ request, url, locals: { supabase } }) => {
		const form = await request.formData();
		const next = getSafeNext(form.get("next"));
		const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`;

		const { data, error } = await supabase.auth.signInWithOAuth({
			provider: "google",
			options: { redirectTo },
		});

		if (error || !data.url) {
			return fail(400, { mode: "login", message: "Googleログインを開始できませんでした" });
		}

		redirect(303, data.url);
	},
};
