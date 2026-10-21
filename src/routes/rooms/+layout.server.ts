import { redirectToLogin } from "$lib/server/require-login";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);
};
