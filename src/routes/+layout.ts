import { createBrowserClient, createServerClient, isBrowser } from "@supabase/ssr";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { Database } from "$lib/supabase/database.types";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	depends("supabase:auth");

	const supabase = isBrowser()
		? createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY)
		: createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
		// deferred Promise をそのまま通過させる
		// layout.svelte 側で $effect を使って非同期解決する
		unreadNotificationCount: data.unreadNotificationCount ?? Promise.resolve(0),
		pendingFollowRequestCount: data.pendingFollowRequestCount ?? Promise.resolve(0),
		extraAccounts: data.extraAccounts ?? [],
	};
};
