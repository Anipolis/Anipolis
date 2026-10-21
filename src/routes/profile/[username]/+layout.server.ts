import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/**
 * ID は大文字・小文字を区別しない（migration 161 で小文字にそろえた）。大文字を含む URL
 * （以前の ID や、手で打った URL）は小文字の URL へ転送する。フォロワー・フォロー中の画面も対象
 */
export const load: LayoutServerLoad = ({ params, url }) => {
	const lower = params.username.toLowerCase();
	if (params.username !== lower) {
		const prefix = `/profile/${encodeURIComponent(params.username)}`;
		const rest = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
		redirect(301, `/profile/${encodeURIComponent(lower)}${rest}${url.search}`);
	}
};
