import { redirectToLogin } from "$lib/server/require-login";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);
	return {};
};
