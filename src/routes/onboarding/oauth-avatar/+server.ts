import { error } from "@sveltejs/kit";
import { fetchOAuthAvatar, getOAuthAvatarUrl } from "$lib/server/oauth-avatar";
import type { RequestHandler } from "./$types";

/**
 * オンボーディングで「OAuth の画像を使う」のプレビューを出すための同一オリジン配信（#328）。
 * Discord・X の画像配信元は CSP の img-src に無いので、ブラウザから直接は読めない。
 * 本人の OAuth 画像だけを返し、任意の URL は受け付けない。
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, "ログインが必要です");

	const avatar = await fetchOAuthAvatar(getOAuthAvatarUrl(user.user_metadata));
	if (!avatar) error(404, "画像を取得できませんでした");

	return new Response(avatar.bytes, {
		headers: {
			"content-type": avatar.mime,
			// URL は全員共通で中身はログイン中の本人で変わるので、ブラウザにも保存させない。
			// 同じブラウザでアカウントを切り替えたときに前の人の画像が候補に出るのを防ぐ
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
		},
	});
};
