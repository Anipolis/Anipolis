import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';
import type { Database } from '$lib/supabase/database.types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
    depends('supabase:auth');

    const supabase = isBrowser()
        ? createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
        : createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
              global: { fetch },
              cookies: {
                  getAll() {
                      return data.cookies ?? [];
                  },
              },
          });

    const session = isBrowser()
        ? (await supabase.auth.getSession()).data.session ?? data.session
        : data.session;

    return {
        supabase,
        session,
        user: data.user,
        profile: data.profile, // レイアウト全体でプロフィールを共有
        unreadNotificationCount: data.unreadNotificationCount ?? 0,
    };
};
