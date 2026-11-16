import { redirectToLogin } from "#lib/server/require-login.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);
	return {};
};
