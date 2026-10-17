import { getAnimeExchangeEntries } from "$lib/server/queries";
import { redirectToLogin } from "$lib/server/require-login";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirectToLogin(url);

	const exchanges = (await getAnimeExchangeEntries(supabase, user.id, null)).filter(
		(exchange) => exchange.status !== "cancelled",
	);
	return { exchanges };
};
