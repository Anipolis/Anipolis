import { error } from "@sveltejs/kit";
import { dev } from "$app/env";

export function load() {
	if (!dev) error(404);
	return {};
}
