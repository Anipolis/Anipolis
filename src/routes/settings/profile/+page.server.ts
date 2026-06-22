import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	if (profile) redirect(303, `/profile/${profile.username}?edit=profile`);
	redirect(303, "/settings");
};
