import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "@sveltejs/kit";
import { admitWithInviteCode } from "$lib/server/beta-admission";
import { isBetaGateEnabled, isBetaMember } from "$lib/server/discord";
import { getInviteCodeCookie } from "$lib/server/invites";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { RequestHandler } from "./$types";

/**
 * メールのリンク（登録の確認・メールアドレスの変更）の着地先。
 * Supabase の既定のリンクは supabase.co を経由し、申請したブラウザでしか開けない（PKCE）。
 * メールのテンプレートを token_hash 方式（{{ .SiteURL }}/auth/confirm?token_hash=…&type=email）にして、
 * ここでサーバーが確認する。別の端末・メールアプリのブラウザで開いても確認できる。
 * パスワード再設定（type=recovery）は /auth/reset-password が同じ方式で受ける。
 */

const CONFIRM_TYPES = new Set<EmailOtpType>(["email", "signup", "email_change"]);

function confirmFailurePath(reason: string | null | undefined): string {
	const safe = reason && /^[a-z0-9_]{1,40}$/.test(reason) ? reason : "unknown";
	return `/auth?error=confirm_failed&reason=${safe}`;
}

export const GET: RequestHandler = async ({ url, cookies, locals: { supabase } }) => {
	const tokenHash = url.searchParams.get("token_hash");
	const type = url.searchParams.get("type") as EmailOtpType | null;
	const next = sanitizeInternalRedirect(url.searchParams.get("next"));

	if (!tokenHash || !type || !CONFIRM_TYPES.has(type)) redirect(303, confirmFailurePath("invalid_link"));

	const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
	const user = data.user;
	if (error || !user) {
		console.error("Email confirmation failed:", { type, code: error?.code });
		redirect(303, confirmFailurePath(error?.code ?? "verify_failed"));
	}

	// クローズドβ: 登録時の招待コードで参加資格を付ける。確認のリンクは別のブラウザで開かれることが
	// 多いので、Cookie に無ければ登録時にアカウントへ残したコード（user_metadata.invite_code）を使う
	if (isBetaGateEnabled() && !isBetaMember(user)) {
		const metadataCode = user.user_metadata?.["invite_code"];
		const inviteCode = getInviteCodeCookie(cookies) ?? (typeof metadataCode === "string" ? metadataCode : null);
		const admission = await admitWithInviteCode(supabase, cookies, user.id, inviteCode);
		if (!admission.granted) {
			await supabase.auth.signOut();
			redirect(303, `/auth?error=${admission.errorCode}`);
		}
	}

	redirect(303, next);
};
