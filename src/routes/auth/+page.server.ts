import { fail, redirect } from "@sveltejs/kit";
import { linkAccounts } from "$lib/server/actions";
import { grantBetaAccess, isBetaGateEnabled, isBetaMember } from "$lib/server/discord";
import {
	clearInviteCodeCookie,
	getInviteCodeCookie,
	inviteRedeemErrorMessage,
	redeemInviteCode,
	setInviteCodeCookie,
	validateInviteCode,
} from "$lib/server/invites";
import { getExtraAccounts, setExtraAccounts } from "$lib/server/multi-account";
import { getClientKey, isRateLimited } from "$lib/server/rate-limit";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

const MIN_PASSWORD_LENGTH = 6;

function getSafeNext(raw: FormDataEntryValue | string | null): string {
	return sanitizeInternalRedirect(typeof raw === "string" ? raw : "/");
}

function normalizeUsername(value: FormDataEntryValue | null): string {
	return (typeof value === "string" ? value : "").trim().toLowerCase();
}

function getInviteCodeInput(form: FormData): string {
	return (form.get("invite_code") as string | null)?.trim() ?? "";
}

export const load: PageServerLoad = async ({ url, cookies, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const next = getSafeNext(url.searchParams.get("next"));
	const rawMode = url.searchParams.get("mode");
	const mode = rawMode === "register" ? "register" : rawMode === "add_account" ? "add_account" : "login";

	// add_account はログイン済みユーザーのみアクセス可
	if (mode === "add_account" && !user) redirect(303, "/auth?mode=login");
	// login/register はログイン済みならリダイレクト
	// ベータ資格を持つログインユーザーのみリダイレクトする。
	// 未資格ユーザーは /auth に留め、not_member メッセージを表示できるようにする（ループ防止）。
	if (mode !== "add_account" && user && isBetaMember(user)) redirect(303, next);

	// 招待リンク（/auth?invite=CODE）を踏んだ場合は、OAuth の往復を挟んでも
	// 持ち越せるよう署名付き Cookie にも保存しておく（手入力欄のプリフィルにも使う）。
	// ただし無効なコードで既存の有効な Cookie を上書きしないよう、
	// ゲート有効時は検証を通ったコードだけを優先して保存する。
	// 有効性の確認は消費しない check_invite_code で都度行う。
	const betaGateEnabled = isBetaGateEnabled();
	const queryInviteCode = url.searchParams.get("invite")?.trim() ?? "";
	const cookieInviteCode = getInviteCodeCookie(cookies) ?? "";

	let inviteCode = queryInviteCode || cookieInviteCode;
	// 招待リンクを踏んでいない/有効な招待コードをまだ持っていない場合、
	// Google・X・メールログインは一切表示しない（招待コード入力かDiscordの二択のみ）。
	let inviteCodeValid = false;
	if (betaGateEnabled) {
		const queryValid = queryInviteCode ? await validateInviteCode(supabase, queryInviteCode) : false;
		// 検証を通らないコードは保存しない（無効コードがCookieに居座るのを防ぐ）
		if (queryValid) setInviteCodeCookie(cookies, queryInviteCode);
		if (queryValid) {
			inviteCodeValid = true;
		} else if (cookieInviteCode) {
			inviteCode = cookieInviteCode;
			inviteCodeValid = await validateInviteCode(supabase, cookieInviteCode);
		}
	} else if (queryInviteCode) {
		setInviteCodeCookie(cookies, queryInviteCode);
	}

	return {
		mode,
		next,
		betaGateEnabled,
		inviteCode,
		inviteCodeValid,
		error: url.searchParams.get("error"),
	};
};

export const actions: Actions = {
	// 招待リンクを踏んでいないユーザーが招待コードを手入力して確認するための専用action。
	// 成功したら Cookie に保存してリロードし、load() 側の inviteCodeValid を true に
	// して Google/X/メールフォームを表示させる（コードは URL に載せず Cookie で運ぶ）。
	applyInvite: async (event) => {
		const {
			request,
			url,
			cookies,
			locals: { supabase },
		} = event;
		const form = await request.formData();
		const inviteCodeInput = getInviteCodeInput(form);
		const mode = url.searchParams.get("mode") === "register" ? "register" : "login";
		const next = getSafeNext(form.get("next"));

		if (!inviteCodeInput) {
			return fail(400, { mode, next, message: "招待コードを入力してください" });
		}

		// 招待コード総当たり対策（IP 単位）
		if (isRateLimited(`auth-invite:${getClientKey(event)}`, 10, 5 * 60_000)) {
			return fail(429, { mode, next, message: "試行回数が多すぎます。しばらく待ってからお試しください" });
		}

		const valid = await validateInviteCode(supabase, inviteCodeInput);
		if (!valid) {
			return fail(400, { mode, next, message: "招待コードが無効です" });
		}

		setInviteCodeCookie(cookies, inviteCodeInput);
		redirect(303, `/auth?mode=${mode}&next=${encodeURIComponent(next)}`);
	},

	login: async (event) => {
		const {
			request,
			cookies,
			locals: { supabase },
		} = event;
		const form = await request.formData();
		const email = (form.get("email") as string | null)?.trim() ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const next = getSafeNext(form.get("next"));
		const inviteCodeInput = getInviteCodeInput(form) || getInviteCodeCookie(cookies) || "";

		if (!email || !password) {
			return fail(400, { mode: "login", email, message: "メールアドレスとパスワードを入力してください" });
		}

		// パスワード総当たり対策（IP 単位）。form action は hooks の /api/* リミッターの対象外のためここで制限する
		if (isRateLimited(`auth-login:${getClientKey(event)}`, 10, 5 * 60_000)) {
			return fail(429, {
				mode: "login",
				email,
				message: "試行回数が多すぎます。しばらく待ってからお試しください",
			});
		}

		const { data, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error || !data.user) {
			return fail(400, {
				mode: "login",
				email,
				message: "メールアドレスまたはパスワードが正しくありません",
			});
		}

		if (isBetaGateEnabled() && !isBetaMember(data.user)) {
			// needInvite: ログインタブは通常招待コード欄を出さないため、
			// このフラグでUI側に入力欄を表示させる
			if (!inviteCodeInput) {
				await supabase.auth.signOut();
				return fail(403, { mode: "login", email, needInvite: true, message: "招待コードを入力してください" });
			}

			const redeemResult = await redeemInviteCode(supabase, inviteCodeInput);
			if (!redeemResult.success) {
				await supabase.auth.signOut();
				return fail(403, {
					mode: "login",
					email,
					needInvite: true,
					message: redeemResult.detail
						? inviteRedeemErrorMessage(redeemResult.detail)
						: "招待コードが無効です",
				});
			}

			const { error: grantError } = await grantBetaAccess(data.user.id);
			if (grantError) {
				await supabase.auth.signOut();
				return fail(500, { mode: "login", email, message: "アクセス許可の付与に失敗しました" });
			}
			clearInviteCodeCookie(cookies);
		}

		redirect(303, next);
	},

	register: async (event) => {
		const {
			request,
			cookies,
			locals: { supabase },
		} = event;
		const form = await request.formData();
		const email = (form.get("email") as string | null)?.trim() ?? "";
		const password = (form.get("password") as string | null) ?? "";
		const username = normalizeUsername(form.get("username"));
		const displayName = (form.get("display_name") as string | null)?.trim() ?? "";
		const next = getSafeNext(form.get("next"));
		const inviteCodeInput = getInviteCodeInput(form) || getInviteCodeCookie(cookies) || "";

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

		// アカウント大量作成・招待コード総当たり対策（IP 単位）。
		// 招待コード検証より前に置き、リミッター素通しでの総当たりを防ぐ
		if (isRateLimited(`auth-register:${getClientKey(event)}`, 5, 10 * 60_000)) {
			return fail(429, {
				mode: "register",
				...values,
				message: "試行回数が多すぎます。しばらく待ってからお試しください",
			});
		}

		// アカウント作成前に招待コードを検証する（無効なコードでアカウントだけ作られる事故を防ぐ）
		if (isBetaGateEnabled()) {
			if (!inviteCodeInput) {
				return fail(403, { mode: "register", ...values, message: "招待コードを入力してください" });
			}
			const inviteValid = await validateInviteCode(supabase, inviteCodeInput);
			if (!inviteValid) {
				return fail(403, { mode: "register", ...values, message: "招待コードが無効です" });
			}
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

		if (data.session && data.user) {
			if (isBetaGateEnabled()) {
				const redeemResult = await redeemInviteCode(supabase, inviteCodeInput);
				if (!redeemResult.success) {
					await supabase.auth.signOut();
					return fail(403, {
						mode: "register",
						...values,
						message: redeemResult.detail
							? inviteRedeemErrorMessage(redeemResult.detail)
							: "招待コードの確認に失敗しました",
					});
				}

				const { error: grantError } = await grantBetaAccess(data.user.id);
				if (grantError) {
					await supabase.auth.signOut();
					return fail(500, { mode: "register", ...values, message: "アクセス許可の付与に失敗しました" });
				}
				clearInviteCodeCookie(cookies);
			}

			redirect(303, next);
		}

		// メール確認が必要なフロー：招待コードは Cookie に残しておき、確認後の
		// ログイン/コールバックで拾えるようにする。
		if (isBetaGateEnabled() && inviteCodeInput) setInviteCodeCookie(cookies, inviteCodeInput);

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

		// 他人アカウントのパスワード総当たり対策（ログイン中ユーザー単位）
		if (isRateLimited(`auth-add-account:${ownerUser.id}`, 5, 10 * 60_000)) {
			return fail(429, {
				mode: "add_account",
				message: "試行回数が多すぎます。しばらく待ってからお試しください",
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
				message: "追加アカウントは最大2つまでです",
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

		const alreadyInCookie = getExtraAccounts(cookies).some((a) => a.userId === targetUserId);

		if (existingLink && alreadyInCookie) {
			await supabase.auth.refreshSession({ refresh_token: ownerRefreshToken });
			return fail(400, { mode: "add_account", message: "このアカウントはすでに追加されています" });
		}

		// アカウント B のプロフィールを取得
		const { data: targetProfile, error: profileError } = await supabase
			.from("profiles")
			.select("username, display_name, avatar_url")
			.eq("id", targetUserId)
			.maybeSingle();

		if (profileError || !targetProfile) {
			// プロフィール取得失敗 — アカウント A のセッションを復元
			await supabase.auth.refreshSession({ refresh_token: ownerRefreshToken });
			return fail(400, { mode: "add_account", message: "プロフィールの取得に失敗しました" });
		}

		// アカウント A のセッションを復元
		const { error: restoreError } = await supabase.auth.refreshSession({
			refresh_token: ownerRefreshToken,
		});

		if (restoreError) {
			return fail(500, {
				mode: "add_account",
				message: "セッションの復元に失敗しました。再度ログインしてください",
			});
		}

		// DB リンクがまだなければ作成（既存の場合は upsert をスキップして制限トリガーの誤発火を回避）
		if (!existingLink) {
			const { error: linkError } = await linkAccounts(serviceClient, ownerUser.id, targetUserId, count ?? 0);
			if (linkError) {
				return fail(500, {
					mode: "add_account",
					message: "アカウントのリンクに失敗しました。しばらく経ってから再試行してください",
				});
			}
		}

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

	google: (event) => startOAuth(event, "google", "Google"),

	// "x" は OAuth 2.0 の X プロバイダー（"twitter" は旧 OAuth 1.0a）。
	// X Developer Portal + Supabase Dashboard 側で X (OAuth 2.0) の有効化が
	// 別途必要 — 未設定だとここでエラーになる。
	twitter: (event) => startOAuth(event, "x", "X"),

	discord: (event) => startOAuth(event, "discord", "Discord", { scopes: "identify email" }),
};

// google / twitter(x) / discord 共通の OAuth 開始処理。
// フォームの招待コードを署名付き Cookie に退避してから認可 URL へ 303 する。
async function startOAuth(
	{ request, url, cookies, locals: { supabase } }: Pick<RequestEvent, "request" | "url" | "cookies" | "locals">,
	provider: "google" | "x" | "discord",
	label: string,
	options: { scopes?: string } = {},
) {
	const form = await request.formData();
	const next = getSafeNext(form.get("next"));
	const inviteCodeInput = getInviteCodeInput(form);
	if (isBetaGateEnabled() && inviteCodeInput) setInviteCodeCookie(cookies, inviteCodeInput);
	const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`;

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider,
		options: { redirectTo, ...options },
	});

	if (error || !data.url) {
		return fail(400, { mode: "login", message: `${label}ログインを開始できませんでした` });
	}

	redirect(303, data.url);
}
