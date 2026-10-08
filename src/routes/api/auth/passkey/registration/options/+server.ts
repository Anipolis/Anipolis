import { json } from "@sveltejs/kit";
import { isPasskeyEnabled, passkeyJson, startPasskeyRegistration } from "$lib/server/passkey";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ url, cookies, locals: { supabase, safeGetSession } }) => {
	if (!isPasskeyEnabled()) return json({ message: "パスキーは現在利用できません" }, { status: 404 });
	const { user, session } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });

	return passkeyJson(await startPasskeyRegistration({ supabase, user, session, url, cookies }));
};
