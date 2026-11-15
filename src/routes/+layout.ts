import { createBrowserClient, createServerClient, isBrowser } from "@supabase/ssr";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$app/env/public";
import type { Database } from "$lib/supabase/database.types";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends("supabase:auth");
	const supabaseUrl = PUBLIC_SUPABASE_URL;
	const supabaseKey = PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? PUBLIC_SUPABASE_ANON_KEY;
	if (!supabaseUrl || !supabaseKey) throw new Error("Supabase public environment variables are not configured");

	const supabase = isBrowser()
		? createBrowserClient<Database>(supabaseUrl, supabaseKey)
		: createServerClient<Database>(supabaseUrl, supabaseKey, {
				global: { fetch },
				cookies: {
					getAll() {
						return data.cookies ?? [];
					},
				},
			});

	return {
		supabase,
		session: data.session,
		user: data.user,
		profile: data.profile,
		unreadNotificationCount: data.unreadNotificationCount ?? Promise.resolve(0),
		roomReminders: data.roomReminders ?? Promise.resolve([]),
		pendingReportsCount: data.pendingReportsCount ?? Promise.resolve(0),
		extraAccounts: data.extraAccounts ?? [],
	};
};
