import { marked } from "marked";
import privacyPolicyMd from "../../../docs/Privacy_Policy.md?raw";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return { html: await marked.parse(privacyPolicyMd) };
};
