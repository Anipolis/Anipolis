import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { insertPostWithHashtags, deletePostAction, toggleLikeAction, toggleRepostAction } from '$lib/server/actions';
import { enrichPostsWithCounts, getFollowingIds } from '$lib/server/queries';

export const load: PageServerLoad = async ({ url, locals: { supabase, safeGetSession }, parent }) => {
    const { profile } = await parent();
    const { user } = await safeGetSession();

    const tab = url.searchParams.get('tab') === 'following' && user ? 'following' : 'all';
    const quoteAnimeId = url.searchParams.get('quote_anime');

    // フォロータブ時はフォロー中ユーザーのIDを取得
    const followingIds = tab === 'following' && user
        ? await getFollowingIds(supabase, user.id)
        : null;

    let postsQuery = supabase
        .from('posts')
        .select(
            `id, content, created_at, user_id, parent_id, image_urls, anime_id,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
        )
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

    if (tab === 'following' && followingIds !== null) {
        if (followingIds.length === 0) {
            const [trendingResult, quoteAnimeResult] = await Promise.all([
                supabase.rpc('get_trending_hashtags', { limit_count: 10 }),
                quoteAnimeId
                    ? supabase.from('anime').select('id, title, title_en, cover_url').eq('id', quoteAnimeId).single()
                    : Promise.resolve({ data: null }),
            ]);
            return {
                posts: [],
                trending: trendingResult.data ?? [],
                profile,
                tab,
                initialAnime: quoteAnimeResult.data ?? null,
            };
        }
        postsQuery = postsQuery.in('user_id', followingIds);
    }

    const [postsResult, trendingResult, quoteAnimeResult] = await Promise.all([
        postsQuery,
        supabase.rpc('get_trending_hashtags', { limit_count: 10 }),
        quoteAnimeId
            ? supabase.from('anime').select('id, title, title_en, cover_url').eq('id', quoteAnimeId).single()
            : Promise.resolve({ data: null }),
    ]);

    const posts = await enrichPostsWithCounts(supabase, postsResult.data ?? [], user?.id ?? null);

    return {
        posts,
        trending: trendingResult.data ?? [],
        profile,
        tab,
        initialAnime: quoteAnimeResult.data ?? null,
    };
};

export const actions: Actions = {
    createPost: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });

        const form = await request.formData();
        const content = (form.get('content') as string | null)?.trim() ?? '';
        const imageUrlsRaw = (form.get('image_urls') as string | null) ?? '[]';
        const animeId = (form.get('anime_id') as string | null)?.trim() || null;
        let imageUrls: string[] = [];
        try { imageUrls = JSON.parse(imageUrlsRaw); } catch { imageUrls = []; }
        return insertPostWithHashtags(supabase, user.id, content, null, imageUrls, animeId);
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
