import type { User } from "@supabase/supabase-js";
import { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } from "$env/static/private";

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
