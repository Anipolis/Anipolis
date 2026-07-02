import { marked } from "marked";
import privacyPolicyMd from "../../../docs/Privacy_Policy.md?raw";
import type { PageServerLoad } from "./$types";

const privacyPolicyHtml = await marked.parse(privacyPolicyMd);

export const load: PageServerLoad = async () => {
	return { html: privacyPolicyHtml };
};
