import { redirect } from "@sveltejs/kit";
import { getExchangeEntries } from "$lib/server/exchange";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw redirect(302, "/");

	const exchanges = (await getExchangeEntries(supabase, user.id, 20)).filter(
		(exchange) => exchange.status !== "cancelled",
	);
	return { user, exchanges };
};
