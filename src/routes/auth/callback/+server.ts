import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Google OAuth のコールバックを処理する
 * Supabase が ?code=xxx を付けてここにリダイレクトしてくる
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get("code");
	const next = url.searchParams.get("next") ?? "/";

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			redirect(303, next);
		}
	}

	// エラー時はホームへ
	redirect(303, "/");
};
