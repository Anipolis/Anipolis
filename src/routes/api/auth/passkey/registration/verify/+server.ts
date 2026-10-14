import { json } from "@sveltejs/kit";
import { finishPasskeyRegistration, isPasskeyEnabled, passkeyJson } from "$lib/server/passkey";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url, cookies, locals: { supabase, safeGetSession } }) => {
	if (!isPasskeyEnabled()) return json({ message: "パスキーは現在利用できません" }, { status: 404 });
	const { user, session } = await safeGetSession();
	if (!user) return json({ message: "ログインが必要です" }, { status: 401 });

	const body: unknown = await request.json().catch(() => null);
	return passkeyJson(await finishPasskeyRegistration({ supabase, user, session, url, cookies, body }));
};
