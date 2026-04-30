import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getEvent, getEventPosts } from '$lib/server/queries';
import {
    insertPostWithHashtags,
    deletePostAction,
    toggleLikeAction,
    toggleRepostAction,
} from '$lib/server/actions';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
    const { user } = await safeGetSession();

    const [event, trending] = await Promise.all([
        getEvent(supabase, params.id),
        supabase.rpc('get_trending_hashtags', { limit_count: 10 }),
    ]);

    if (!event) throw error(404, 'イベントが見つかりません');

    const posts = await getEventPosts(supabase, event.hashtag, user?.id ?? null);

    return { event, posts, trending: trending.data ?? [], user };
};

export const actions: Actions = {
    // イベントルームへの投稿（ハッシュタグを自動付与）
    createPost: async ({ request, locals: { supabase, safeGetSession } }) => {
        const { user } = await safeGetSession();
        if (!user) return fail(401, { message: 'ログインが必要です' });

        const form = await request.formData();
        const content = (form.get('content') as string | null)?.trim() ?? '';
        const hashtag = (form.get('hashtag') as string | null)?.trim() ?? '';

        // ハッシュタグが含まれていなければ自動付与
        const hasTag = content.toLowerCase().includes(`#${hashtag.toLowerCase()}`);
        const finalContent = hasTag ? content : `${content} #${hashtag}`;

        return insertPostWithHashtags(supabase, user.id, finalContent);
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
