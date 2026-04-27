import type { LayoutServerLoad } from './$types';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import { getUnreadNotificationCount } from '$lib/server/queries';

type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * プロフィールを取得、なければ Google メタデータから自動作成する
 */
async function getOrCreateProfile(
    supabase: SupabaseClient<Database>,
    user: User,
): Promise<Profile | null> {
    const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (existing) return existing;

    // Google ログイン後にトリガーが未実行の場合に備えて手動作成
    const rawBase = (
        (user.user_metadata?.['user_name'] as string | undefined) ||
        user.email?.split('@')[0] ||
        'user'
    )
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(0, 14) || 'user';

    // user.id の先頭5文字を付けて一意性を保証
    const username = `${rawBase}_${user.id.slice(0, 5)}`;

    const { data: created } = await supabase
        .from('profiles')
        .upsert(
            {
                id: user.id,
                username,
                display_name: (user.user_metadata?.['full_name'] as string | null) ?? null,
                avatar_url: (user.user_metadata?.['avatar_url'] as string | null) ?? null,
            },
            { onConflict: 'id' },
        )
        .select('*')
        .single();

    return created;
}

export const load: LayoutServerLoad = async ({ locals: { supabase, safeGetSession }, cookies }) => {
    const { session, user } = await safeGetSession();

    const profile = user ? await getOrCreateProfile(supabase, user) : null;
    const unreadNotificationCount = user
        ? await getUnreadNotificationCount(supabase, user.id)
        : 0;

    return {
        session,
        user,
        profile,
        unreadNotificationCount,
        cookies: cookies.getAll(),
    };
};
