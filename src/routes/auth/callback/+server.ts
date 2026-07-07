import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { isBetaGateEnabled, isBetaMember, verifyGuildMembership } from "$lib/server/discord";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { RequestHandler } from "./$types";

/**
 * OAuth のコールバックを処理する。
 * Supabase が ?code=xxx を付けてここにリダイレクトしてくる。
 *
 * Discord ログイン時のみ、対象サーバーへの所属を Bot トークンで検証し、
 * メンバーであれば app_metadata.beta_member=true を付与する。
 * クローズドβ中は、Discord 所属検証を通っていないユーザー（Google / メール等）の
 * セッションをここで破棄する。hooks のゲートは遷移を弾くだけでログアウトはさせず、
 * セッションが残ると「ログインできてしまう」状態になるため、明示的に signOut する。
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
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

	// Discord ログインのみ所属検証を行う
	const discordIdentity = user.identities?.find((identity) => identity.provider === "discord");
	if (discordIdentity) {
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

		if (!granted) {
			await supabase.auth.signOut();
			redirect(303, "/auth?error=not_member");
		}

		// メンバー確定 → ベータ資格を app_metadata に刻む（サーバー権威・改変不可）
		const admin = createServiceRoleClient();
		const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
			app_metadata: { beta_member: true },
		});
		if (updateError) {
			console.error("Failed to grant beta access:", updateError);
			await supabase.auth.signOut();
			redirect(303, "/auth?error=not_member");
		}

		betaGranted = true;
	}

	// クローズドβ：所属検証を通っていないユーザー（Google / メール等）は
	// セッションを破棄してログインを成立させない。
	if (isBetaGateEnabled() && !betaGranted) {
		await supabase.auth.signOut();
		redirect(303, "/auth?error=not_member");
	}

	redirect(303, safeNext);
};
