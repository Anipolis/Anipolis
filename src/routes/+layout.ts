import { createBrowserClient, createServerClient, isBrowser } from "@supabase/ssr";
import { env as publicEnv } from "$env/dynamic/public";
import type { Database } from "$lib/supabase/database.types";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends("supabase:auth");
	const supabaseUrl = publicEnv["PUBLIC_SUPABASE_URL"];
	const supabaseKey = publicEnv["PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ?? publicEnv["PUBLIC_SUPABASE_ANON_KEY"];
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
		unreadBroadcastNotificationCount: data.unreadBroadcastNotificationCount ?? Promise.resolve(0),
		pendingReportsCount: data.pendingReportsCount ?? Promise.resolve(0),
		extraAccounts: data.extraAccounts ?? [],
	};
};
