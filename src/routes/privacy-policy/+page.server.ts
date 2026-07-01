import { redirect } from "@sveltejs/kit";
import { marked } from "marked";
import privacyPolicyMd from "../../../docs/Privacy_Policy.md?raw";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) redirect(303, "/");

	return { html: await marked.parse(privacyPolicyMd) };
};
