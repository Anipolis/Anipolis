import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { grantBetaAccess, isBetaGateEnabled, isBetaMember, verifyGuildMembership } from "$lib/server/discord";
import { clearInviteCodeCookie, getInviteCodeCookie, redeemInviteCode } from "$lib/server/invites";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { RequestHandler } from "./$types";

/**
 * OAuth のコールバックを処理する。
 * Supabase が ?code=xxx を付けてここにリダイレクトしてくる。
 *
 * ベータアクセスの許可は2経路のOR条件：
 * ① Discord ログイン時、対象サーバーへの所属を Bot トークンで検証する。
 * ② 招待コード（/auth のフォーム/リンクで受け渡され、署名付き Cookie で持ち越される）を消費する。
 * どちらも通らない場合は、ここでセッションを破棄してログインを成立させない。
 * hooks のゲートは遷移を弾くだけでログアウトはさせず、セッションが残ると
 * 「ログインできてしまう」状態になるため、明示的に signOut する。
 */
export const GET: RequestHandler = async ({ url, cookies, locals: { supabase } }) => {
	const code = url.searchParams.get("code");
	const safeNext = sanitizeInternalRedirect(url.searchParams.get("next"));

	if (!code) redirect(303, "/");

	const { error } = await supabase.auth.exchangeCodeForSession(code);
	if (error) redirect(303, "/");

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect(303, "/");

	// 既に beta_member を持つ既存ユーザーは検証通過済みとして扱う（再ログイン時）
	let betaGranted = isBetaMember(user);
	let errorCode = "not_member";

	// ① Discord ログインのみ所属検証を行う
	const discordIdentity = user.identities?.find((identity) => identity.provider === "discord");
	if (!betaGranted && discordIdentity) {
		const discordUserId =
			(discordIdentity.identity_data?.["provider_id"] as string | undefined) ??
			(discordIdentity.identity_data?.["sub"] as string | undefined) ??
			discordIdentity.id;

		let granted = false;
		if (discordUserId) {
			try {
				const { isMember, roles } = await verifyGuildMembership(discordUserId);
				const requiredRole = env["DISCORD_REQUIRED_ROLE_ID"];
				granted = isMember && (!requiredRole || roles.includes(requiredRole));
			} catch (e) {
				// 検証不能（レート制限・トークン不正・Discord 障害）は安全側に倒して不許可
				console.error("Discord membership verification failed:", e);
				granted = false;
			}
		}

		if (granted) {
			const { error: grantError } = await grantBetaAccess(user.id);
			if (grantError) {
				console.error("grantBetaAccess failed after Discord verification:", { userId: user.id });
				await supabase.auth.signOut();
				redirect(303, "/auth?error=grant_failed");
			}
			betaGranted = true;
		}
	}

	// ② 招待コード（Cookie 経由）— Discord で許可されなかった場合、または
	// Discord 以外（Google / X / メール）のログインで試みる。
	// ゲート無効時は招待コードを無駄に消費しないようスキップする。
	if (isBetaGateEnabled() && !betaGranted) {
		const inviteCode = getInviteCodeCookie(cookies);
		if (inviteCode) {
			const redeemResult = await redeemInviteCode(supabase, inviteCode);
			if (redeemResult.success) {
				const { error: grantError } = await grantBetaAccess(user.id);
				if (grantError) {
					// 償還は user_id 単位で冪等（再ログインで再試行すれば付与だけやり直せる）
					console.error("grantBetaAccess failed after invite redemption:", { userId: user.id });
					errorCode = "grant_failed";
				} else {
					betaGranted = true;
					clearInviteCodeCookie(cookies);
				}
			} else {
				errorCode = redeemResult.detail === "INVITE_EXHAUSTED" ? "invite_exhausted" : "invalid_invite";
				// 無効・失効が確定したコードを残すと、再ログインのたびに同じエラーを踏む
				clearInviteCodeCookie(cookies);
			}
		} else if (!discordIdentity) {
			errorCode = "invite_required";
		}
	}

	// クローズドβ：どちらの経路でも許可を得られなかったユーザーは
	// セッションを破棄してログインを成立させない。
	if (isBetaGateEnabled() && !betaGranted) {
		await supabase.auth.signOut();
		redirect(303, `/auth?error=${errorCode}`);
	}

	redirect(303, safeNext);
};
