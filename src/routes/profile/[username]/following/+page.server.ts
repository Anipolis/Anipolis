import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFollowingProfiles, getFollowCounts } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('username', params.username)
        .maybeSingle();

    if (!profile) {
        error(404, 'ユーザーが見つかりません');
    }

    const [following, followCounts] = await Promise.all([
        getFollowingProfiles(supabase, profile.id),
        getFollowCounts(supabase, profile.id),
    ]);

    return { profile, following, followCounts, user };
};
