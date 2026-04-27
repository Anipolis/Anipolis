import { fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { deletePostAction, toggleLikeAction, toggleRepostAction, toggleFollowAction } from '$lib/server/actions';
import { enrichPostsWithCounts, getFollowCounts, checkIsFollowing, getUserAnimeList } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', params.username)
        .maybeSingle();

    if (!profile) {
        error(404, 'ユーザーが見つかりません');
    }

    const isOwn = user?.id === profile.id;

    const [rawPostsResult, followCounts, isFollowing, trendingResult, animeList] = await Promise.all([
        supabase
            .from('posts')
            .select(
                `id, content, created_at, user_id, parent_id, image_urls,
                 profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
                 post_hashtags ( hashtags ( name ) )`,
            )
            .eq('user_id', profile.id)
            .is('parent_id', null)
            .order('created_at', { ascending: false })
            .limit(50),

        getFollowCounts(supabase, profile.id),

        user && user.id !== profile.id
            ? checkIsFollowing(supabase, user.id, profile.id)
            : Promise.resolve(false),

        supabase.rpc('get_trending_hashtags', { limit_count: 10 }),

        isOwn || profile.list_is_public
            ? getUserAnimeList(supabase, profile.id)
            : Promise.resolve([]),
    ]);

    const posts = await enrichPostsWithCounts(supabase, rawPostsResult.data ?? [], user?.id ?? null);

    return {
        profile,
        posts,
        isOwn,
        followCounts,
        isFollowing,
        trending: trendingResult.data ?? [],
        animeList,
        user,
    };
};

export const actions: Actions = {
    follow: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });
        return toggleFollowAction(request, supabase, user.id);
    },

    deletePost: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });
        return deletePostAction(request, supabase, user.id);
    },

    like: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });
        return toggleLikeAction(request, supabase, user.id);
    },

    repost: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });
        return toggleRepostAction(request, supabase, user.id);
    },
};
