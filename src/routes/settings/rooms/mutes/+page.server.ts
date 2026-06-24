import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	redirect(
		301,
		`/settings/mutes?tab=anime${url.searchParams.get("anime_id") ? `&anime_id=${url.searchParams.get("anime_id")}` : ""}`,
	);
};
