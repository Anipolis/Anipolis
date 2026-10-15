import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cookies } from "@sveltejs/kit";
import type { Database } from "$lib/supabase/database.types";
import { grantBetaAccess } from "./discord";
import { clearInviteCodeCookie, redeemInviteCode } from "./invites";

export type InviteAdmission =
	| { granted: true }
	| { granted: false; errorCode: "invite_required" | "invalid_invite" | "invite_exhausted" | "grant_failed" };

/**
 * 招待コードを消費して、クローズドβの参加資格を付ける。OAuth のコールバックとメール確認（/auth/confirm）で共通。
 * 無効・失効が確定したコードは Cookie から消す（再ログインのたびに同じエラーを踏まないように）。
 * 償還は user_id 単位で冪等なので、付与だけ失敗した場合は再ログインでやり直せる。
 */
export async function admitWithInviteCode(
	supabase: SupabaseClient<Database>,
	cookies: Cookies,
	userId: string,
	inviteCode: string | null,
): Promise<InviteAdmission> {
	if (!inviteCode) return { granted: false, errorCode: "invite_required" };

	const redeemResult = await redeemInviteCode(supabase, inviteCode);
	if (!redeemResult.success) {
		clearInviteCodeCookie(cookies);
		return {
			granted: false,
			errorCode: redeemResult.detail === "INVITE_EXHAUSTED" ? "invite_exhausted" : "invalid_invite",
		};
	}

	const { error } = await grantBetaAccess(userId);
	if (error) {
		console.error("grantBetaAccess failed after invite redemption:", { userId });
		return { granted: false, errorCode: "grant_failed" };
	}
	clearInviteCodeCookie(cookies);
	return { granted: true };
}
