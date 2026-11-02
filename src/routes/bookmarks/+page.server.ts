import { redirect } from "@sveltejs/kit";
import { redirectToLogin } from "$lib/server/require-login";
import type { PageServerLoad } from "./$types";

/** ブックマークはプロフィールの「ブックマーク」のタブへ移した（サイドバーの場所はコレクションに譲った）。前のリンクはそちらへ送る */
export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
	redirect(303, profile ? `/profile/${profile.username}?tab=bookmarks` : "/");
};
