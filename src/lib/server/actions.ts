import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { AnimeStatus } from '$lib/types';
import { extractHashtags } from '$lib/utils/hashtag';

/**
 * 投稿（＋ハッシュタグ）を挿入する共通ロジック
 * タイムラインの createPost とリプライの reply で使い回す
 */
export async function insertPostWithHashtags(
    supabase: SupabaseClient<Database>,
    userId: string,
    content: string,
    parentId: string | null = null,
    imageUrls: string[] = [],
    animeId: string | null = null,
) {
    if (!content && imageUrls.length === 0 && !animeId) return fail(400, { message: '内容、画像、またはアニメを選択してください' });
    if (content.length > 280) return fail(400, { message: '280文字以内で入力してください' });

    const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({ user_id: userId, content, parent_id: parentId, image_urls: imageUrls, anime_id: animeId || null })
        .select('id')
        .single();

    if (postError || !post) {
        console.error('post insert error:', postError);
        return fail(500, { message: '投稿に失敗しました' });
    }

    // ハッシュタグを処理（重複エラーは無視）
    const tags = extractHashtags(content);
    for (const tag of tags) {
        await supabase.from('hashtags').insert({ name: tag });
        const { data: hashtag } = await supabase
            .from('hashtags')
            .select('id')
            .eq('name', tag)
            .maybeSingle();
        if (hashtag) {
            await supabase
                .from('post_hashtags')
                .insert({ post_id: post.id, hashtag_id: hashtag.id });
        }
    }

    return { success: true, postId: post.id };
}

/**
 * 投稿削除 — 自分の投稿のみ削除可（RLS でも保証済み）
 */
export async function deletePostAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const postId = (form.get('post_id') as string | null)?.trim() ?? '';

    if (!postId) return fail(400, { message: '投稿IDが不正です' });

    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId); // RLS の二重確認

    if (error) return fail(500, { message: '削除に失敗しました' });

    return { deleted: true };
}

/**
 * いいねのトグル — 既にいいね済みなら削除、未いいねなら挿入
 */
export async function toggleLikeAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const postId = (form.get('post_id') as string | null)?.trim() ?? '';
    if (!postId) return fail(400, { message: '投稿IDが不正です' });

    const { data: existing } = await supabase
        .from('likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

    if (existing) {
        await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
        return { liked: false };
    } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: userId });
        return { liked: true };
    }
}

/**
 * リポストのトグル — 既にリポスト済みなら削除、未リポストなら挿入
 */
export async function toggleRepostAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const postId = (form.get('post_id') as string | null)?.trim() ?? '';
    if (!postId) return fail(400, { message: '投稿IDが不正です' });

    const { data: existing } = await supabase
        .from('reposts')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

    if (existing) {
        await supabase.from('reposts').delete().eq('post_id', postId).eq('user_id', userId);
        return { reposted: false };
    } else {
        await supabase.from('reposts').insert({ post_id: postId, user_id: userId });
        return { reposted: true };
    }
}

/**
 * 全通知を既読にする
 */
export async function markAllNotificationsRead(
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    await supabase
        .from('notifications')
        .update({ read: true })
        .eq('recipient_id', userId)
        .eq('read', false);
}

// ================================================================
// イベント視聴ルーム アクション
// ================================================================

/**
 * 新しいイベントを作成する
 */
export async function createEventAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const title = (form.get('title') as string | null)?.trim() ?? '';
    const description = (form.get('description') as string | null)?.trim() || null;
    const rawHashtag = (form.get('hashtag') as string | null)?.trim() ?? '';
    const scheduledAtRaw = (form.get('scheduled_at') as string | null)?.trim() ?? '';
    const durationRaw = (form.get('duration_minutes') as string | null)?.trim() ?? '';

    if (!title) return fail(400, { message: 'タイトルを入力してください' });
    if (title.length > 100) return fail(400, { message: 'タイトルは100文字以内で入力してください' });

    // # を除いたハッシュタグ名を正規化
    const hashtag = rawHashtag.replace(/^#/, '').toLowerCase();
    if (!hashtag) return fail(400, { message: 'ハッシュタグを入力してください' });
    if (hashtag.length > 50) return fail(400, { message: 'ハッシュタグは50文字以内で入力してください' });
    if (!/^[a-z0-9_\u3000-\u9fff\uff00-\uffef\u4e00-\u9fff]+$/u.test(hashtag)) {
        return fail(400, { message: 'ハッシュタグに使用できない文字が含まれています' });
    }

    if (!scheduledAtRaw) return fail(400, { message: '開始日時を入力してください' });
    const scheduledAt = new Date(scheduledAtRaw);
    if (isNaN(scheduledAt.getTime())) return fail(400, { message: '開始日時の形式が正しくありません' });

    const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : null;
    if (durationMinutes !== null && (isNaN(durationMinutes) || durationMinutes <= 0)) {
        return fail(400, { message: '配信時間は正の整数で入力してください' });
    }

    const { data: event, error } = await supabase
        .from('events')
        .insert({
            creator_id: userId,
            title,
            description,
            hashtag,
            scheduled_at: scheduledAt.toISOString(),
            duration_minutes: durationMinutes,
        })
        .select('id')
        .single();

    if (error || !event) {
        console.error('event create error:', error);
        return fail(500, { message: 'イベントの作成に失敗しました' });
    }

    return { success: true, eventId: event.id };
}

/**
 * イベントをキャンセルする（作成者のみ）
 */
export async function cancelEventAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const eventId = (form.get('event_id') as string | null)?.trim() ?? '';
    if (!eventId) return fail(400, { message: 'イベントIDが不正です' });

    const { error } = await supabase
        .from('events')
        .update({ is_cancelled: true })
        .eq('id', eventId)
        .eq('creator_id', userId);

    if (error) return fail(500, { message: 'キャンセルに失敗しました' });
    return { cancelled: true };
}

/**
 * フォローのトグル — フォロー済みなら解除、未フォローなら追加
 */
export async function toggleFollowAction(
    request: Request,
    supabase: SupabaseClient<Database>,
    userId: string,
) {
    const form = await request.formData();
    const targetId = (form.get('target_id') as string | null)?.trim() ?? '';
    if (!targetId) return fail(400, { message: 'ユーザーIDが不正です' });
    if (targetId === userId) return fail(400, { message: '自分自身をフォローできません' });

    const { data: existing } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', userId)
        .eq('following_id', targetId)
        .maybeSingle();

    if (existing) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId);
        return { followed: false };
    } else {
        await supabase.from('follows').insert({ follower_id: userId, following_id: targetId });
        return { followed: true };
    }
}

export async function upsertUserAnimeEntry(
    supabase: SupabaseClient<Database>,
    request: Request,
    userId: string,
) {
    const form = await request.formData();
    const animeId = (form.get('anime_id') as string | null)?.trim() ?? '';
    const status = (form.get('status') as string | null)?.trim() as AnimeStatus | null;
    const scoreRaw = form.get('score') as string | null;
    const progressRaw = form.get('progress') as string | null;

    if (!animeId) return fail(400, { message: 'アニメIDが不正です' });
    if (!status) return fail(400, { message: 'ステータスを選択してください' });

    const score = scoreRaw ? parseFloat(scoreRaw) : null;
    const progress = progressRaw ? parseInt(progressRaw, 10) : 0;

    const { error } = await supabase.from('user_anime_list').upsert(
        { user_id: userId, anime_id: animeId, status, score, progress },
        { onConflict: 'user_id,anime_id' },
    );

    if (error) return fail(500, { message: 'マイリストの更新に失敗しました' });
    return { success: true };
}

export async function removeUserAnimeEntry(
    supabase: SupabaseClient<Database>,
    request: Request,
    userId: string,
) {
    const form = await request.formData();
    const animeId = (form.get('anime_id') as string | null)?.trim() ?? '';
    if (!animeId) return fail(400, { message: 'アニメIDが不正です' });

    const { error } = await supabase
        .from('user_anime_list')
        .delete()
        .eq('user_id', userId)
        .eq('anime_id', animeId);

    if (error) return fail(500, { message: 'マイリストの削除に失敗しました' });
    return { success: true };
}
