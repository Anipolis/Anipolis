import type { User } from "@supabase/supabase-js";
import { env as publicEnv } from "$env/dynamic/public";
import { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } from "$env/static/private";
import { createServiceRoleClient } from "$lib/server/supabase-admin";

/**
 * クローズドβのアクセスゲートが有効かどうか。
 * hooks の全ルート遮断・/auth のログイン手段制限・/auth/callback のセッション破棄は
 * すべてこの判定を共有する（フラグを消せば β ゲート全体が無効になる）。
 */
export function isBetaGateEnabled(): boolean {
	return publicEnv["PUBLIC_CLOSED_BETA"] === "true";
}

/**
 * Discord Bot トークンを使って、指定 Guild にユーザーが在籍しているか照会する。
 *
 * 単一メンバーの REST 照会（GET /guilds/{guild}/members/{user}）は、
 * Bot が対象サーバーに参加していれば特権 Server Members Intent なしで利用できる。
 *
 * @param discordUserId Discord のユーザーID（snowflake）
 * @returns 在籍していれば { isMember: true, roles }、未参加なら { isMember: false, roles: [] }
 * @throws Discord API がメンバー判定不能なステータス（401/403/429/5xx 等）を返した場合
 */
export async function verifyGuildMembership(discordUserId: string): Promise<{ isMember: boolean; roles: string[] }> {
	const res = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`, {
		headers: {
			Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
		},
	});

	if (res.status === 200) {
		const member = (await res.json()) as { roles?: string[] };
		return { isMember: true, roles: member.roles ?? [] };
	}

	// 404 = メンバーではない（Guild には存在するが当該ユーザーが不在）
	if (res.status === 404) {
		return { isMember: false, roles: [] };
	}

	// それ以外（401/403=トークンや権限不正、429=レート制限、5xx=Discord 障害）は
	// 「未参加」と誤判定しないよう、呼び出し側で握れるエラーとして投げる。
	const body = await res.text().catch(() => "");
	throw new Error(`Discord API error: ${res.status} ${res.statusText} ${body}`.trim());
}

/**
 * ユーザーがクローズドβのアクセス資格（Discord サーバー所属検証済み）を
 * 持っているかを判定する。資格は app_metadata.beta_member に保存される
 * （サーバー権威・ユーザーからは改変不可）。
 */
export function isBetaMember(user: Pick<User, "app_metadata"> | null | undefined): boolean {
	return user?.app_metadata?.["beta_member"] === true;
}

/**
 * ベータアクセス資格を app_metadata に刻む（サーバー権威・ユーザーからは改変不可）。
 * Discord 所属検証・招待コード償還のどちらの経路から来ても、許可の付与自体は
 * このヘルパー1箇所（service role 経由）に統一する。
 */
export async function grantBetaAccess(userId: string): Promise<{ error: string | null }> {
	const admin = createServiceRoleClient();
	const { error } = await admin.auth.admin.updateUserById(userId, {
		app_metadata: { beta_member: true },
	});
	if (error) {
		console.error("Failed to grant beta access:", error);
		return { error: error.message };
	}
	return { error: null };
}
