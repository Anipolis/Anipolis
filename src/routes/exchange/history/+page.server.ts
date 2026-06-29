import { redirect } from "@sveltejs/kit";
import { getAnimeExchangeEntries } from "$lib/server/queries";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(302, "/");

	const exchanges = (await getAnimeExchangeEntries(supabase, user.id, null)).filter(
		(exchange) => exchange.status !== "cancelled",
	);
	return { exchanges };
};
