import { json } from "@sveltejs/kit";
import { finishPasskeyLogin, isPasskeyEnabled } from "$lib/server/passkey";
import { sanitizeInternalRedirect } from "$lib/utils/url";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url, cookies, locals: { supabase } }) => {
	if (!isPasskeyEnabled()) return json({ message: "パスキーは現在利用できません" }, { status: 404 });

	const body: unknown = await request.json().catch(() => null);
	const result = await finishPasskeyLogin({ supabase, url, cookies, body });
	if (!result.ok) return json({ message: result.message }, { status: result.status });

	const next = body && typeof body === "object" && "next" in body && typeof body.next === "string" ? body.next : "/";
	return json({ redirectTo: sanitizeInternalRedirect(next) });
};
