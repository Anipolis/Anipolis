import { fail, redirect } from "@sveltejs/kit";
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

	if (user) redirect(303, next);

	return {
		mode: url.searchParams.get("mode") === "register" ? "register" : "login",
		next,
	};
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
