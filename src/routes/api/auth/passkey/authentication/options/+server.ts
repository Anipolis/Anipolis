import { json } from "@sveltejs/kit";
import { isPasskeyEnabled, passkeyJson, startPasskeyLogin } from "$lib/server/passkey";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ url, cookies }) => {
	if (!isPasskeyEnabled()) return json({ message: "パスキーは現在利用できません" }, { status: 404 });
	return passkeyJson(await startPasskeyLogin({ url, cookies }));
};
