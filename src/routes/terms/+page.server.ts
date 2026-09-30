import { marked } from "marked";
import termsOfServiceMd from "../../../docs/Terms_of_Service.md?raw";
import type { PageServerLoad } from "./$types";

const termsOfServiceHtml = await marked.parse(termsOfServiceMd);

export const load: PageServerLoad = async () => {
	return { html: termsOfServiceHtml };
};
