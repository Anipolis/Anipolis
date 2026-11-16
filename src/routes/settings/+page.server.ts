import { hasPasswordProvider } from "#lib/server/auth.ts";
import { isPasskeyEnabled } from "#lib/server/passkey.ts";
import { getPendingFollowRequestCount } from "#lib/server/queries.ts";
import { redirectToLogin } from "#lib/server/require-login.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	const hasEmailProvider = hasPasswordProvider(user, session);
	const pendingFollowRequestCount = await getPendingFollowRequestCount(supabase, user.id);
	return { pendingFollowRequestCount, hasEmailProvider, passkeyEnabled: isPasskeyEnabled() };
};
