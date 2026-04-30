import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import { toPost } from '$lib/types';
import type { Post, Notification, Event, Anime, AnimeStatus, UserAnimeEntry } from '$lib/types';

/**
 * rawPost 配列に like_count / repost_count / reply_count / liked_by_me / reposted_by_me を付加して
 * Post[] に変換する共通ヘルパー。
 * 全ルートサーバー（タイムライン・プロフィール・ハッシュタグ・検索・詳細）で使い回す。
 */
export async function enrichPostsWithCounts(
    supabase: SupabaseClient<Database>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawPosts: any[],
    userId: string | null,
): Promise<Post[]> {
    if (rawPosts.length === 0) return [];

    const postIds = rawPosts.map((p) => p.id as string);

    // ── 並列バッチクエリ ──────────────────────────────────────────
    const [likesRes, repostsRes, repliesRes, myLikesRes, myRepostsRes] = await Promise.all([
        // 各投稿のいいね数（post_id ごとにカウント）
        supabase.from('likes').select('post_id').in('post_id', postIds),

        // 各投稿のリポスト数
        supabase.from('reposts').select('post_id').in('post_id', postIds),

        // 各投稿のリプライ数（parent_id が投稿IDに一致するもの）
        supabase.from('posts').select('parent_id').in('parent_id', postIds),

        // ログイン中ユーザーのいいね一覧
        userId
            ? supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds)
            : Promise.resolve({ data: [] as { post_id: string }[] }),

        // ログイン中ユーザーのリポスト一覧
        userId
            ? supabase
                  .from('reposts')
                  .select('post_id')
                  .eq('user_id', userId)
                  .in('post_id', postIds)
            : Promise.resolve({ data: [] as { post_id: string }[] }),
    ]);

    // ── JS でカウント集計 ─────────────────────────────────────────
    const likeCount = countByPostId(likesRes.data ?? []);
    const repostCount = countByPostId(repostsRes.data ?? []);
    const replyCount = countByPostId(
        (repliesRes.data ?? []).map((r) => ({ post_id: r.parent_id as string })),
    );

    const likedSet = new Set((myLikesRes.data ?? []).map((r) => r.post_id));
    const repostedSet = new Set((myRepostsRes.data ?? []).map((r) => r.post_id));

    // ── アニメ引用がある投稿のスコアを一括取得 ────────────────────
    const animeIds = [...new Set(rawPosts.map((p) => p.anime_id).filter(Boolean))] as string[];
    const userScoreMap = new Map<string, number | null>();
    if (userId && animeIds.length > 0) {
        const { data: entries } = await supabase
            .from('user_anime_list')
            .select('anime_id, score')
            .eq('user_id', userId)
            .in('anime_id', animeIds);
        for (const e of entries ?? []) {
            userScoreMap.set(e.anime_id, e.score);
        }
    }

    return rawPosts.map((raw) => {
        const post = toPost(raw, {
            like_count: likeCount.get(raw.id) ?? 0,
            repost_count: repostCount.get(raw.id) ?? 0,
            reply_count: replyCount.get(raw.id) ?? 0,
            liked_by_me: likedSet.has(raw.id),
            reposted_by_me: repostedSet.has(raw.id),
        });
        if (post.anime_quote && post.anime_id) {
            post.anime_quote.user_score = userScoreMap.get(post.anime_id) ?? null;
        }
        return post;
    });
}

function countByPostId(rows: { post_id: string }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
        map.set(row.post_id, (map.get(row.post_id) ?? 0) + 1);
    }
    return map;
}

/**
 * 通知一覧を取得する（actor プロフィールと投稿内容を JOIN して返す）
 */
export async function getNotifications(
    supabase: SupabaseClient<Database>,
    userId: string,
    limit = 50,
): Promise<Notification[]> {
    const { data, error } = await supabase
        .from('notifications')
        .select(`
            id,
            type,
            post_id,
            read,
            created_at,
            actor:profiles!notifications_actor_id_fkey (
                username,
                display_name,
                avatar_url
            ),
            post:posts!notifications_post_id_fkey (
                content
            )
        `)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
        id: row.id,
        type: row.type as 'like' | 'repost' | 'reply',
        post_id: row.post_id,
        read: row.read,
        created_at: row.created_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actor_username: (row.actor as any)?.username ?? 'unknown',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actor_display_name: (row.actor as any)?.display_name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actor_avatar_url: (row.actor as any)?.avatar_url ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        post_content: (row.post as any)?.content ?? '',
    }));
}

/**
 * 未読通知数を返す（ナビゲーションバッジ用）
 */
export async function getUnreadNotificationCount(
    supabase: SupabaseClient<Database>,
    userId: string,
): Promise<number> {
    const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('read', false);

    return count ?? 0;
}

// ================================================================
// イベント視聴ルーム クエリ
// ================================================================

/**
 * 指定年月のイベント一覧を取得する（カレンダー表示用）
 */
export async function getEventsByMonth(
    supabase: SupabaseClient<Database>,
    year: number,
    month: number,
): Promise<Event[]> {
    const startOfMonth = new Date(year, month - 1, 1).toISOString();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    const { data, error } = await supabase
        .from('events')
        .select(`
            id, creator_id, title, description, hashtag,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
        .gte('scheduled_at', startOfMonth)
        .lte('scheduled_at', endOfMonth)
        .order('scheduled_at', { ascending: true });

    if (error || !data) return [];
    return data.map(toEvent);
}

/**
 * 直近のイベント一覧を取得する（サイドバー・トップページ用）
 */
export async function getUpcomingEvents(
    supabase: SupabaseClient<Database>,
    limit = 5,
): Promise<Event[]> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('events')
        .select(`
            id, creator_id, title, description, hashtag,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
        .gte('scheduled_at', now)
        .eq('is_cancelled', false)
        .order('scheduled_at', { ascending: true })
        .limit(limit);

    if (error || !data) return [];
    return data.map(toEvent);
}

/**
 * イベント単体を ID で取得する
 */
export async function getEvent(
    supabase: SupabaseClient<Database>,
    eventId: string,
): Promise<Event | null> {
    const { data, error } = await supabase
        .from('events')
        .select(`
            id, creator_id, title, description, hashtag,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
        .eq('id', eventId)
        .maybeSingle();

    if (error || !data) return null;
    return toEvent(data);
}

/**
 * イベントのハッシュタグを持つ投稿を取得する（イベントルーム表示用）
 */
export async function getEventPosts(
    supabase: SupabaseClient<Database>,
    hashtag: string,
    userId: string | null,
    limit = 100,
): Promise<Post[]> {
    // ハッシュタグ ID を取得
    const { data: hashtagRow } = await supabase
        .from('hashtags')
        .select('id')
        .eq('name', hashtag.toLowerCase())
        .maybeSingle();

    if (!hashtagRow) return [];

    // そのハッシュタグを持つ post_id を取得
    const { data: links } = await supabase
        .from('post_hashtags')
        .select('post_id')
        .eq('hashtag_id', hashtagRow.id);

    const postIds = (links ?? []).map((l) => l.post_id);
    if (postIds.length === 0) return [];

    const { data: rawPosts } = await supabase
        .from('posts')
        .select(
            `id, content, created_at, user_id, parent_id, image_urls, anime_id,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
        )
        .in('id', postIds)
        .is('parent_id', null)   // トップレベル投稿のみ
        .order('created_at', { ascending: false })
        .limit(limit);

    return enrichPostsWithCounts(supabase, rawPosts ?? [], userId);
}

// ── ヘルパー ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEvent(raw: any): Event {
    const profiles = raw.profiles;
    return {
        id: raw.id,
        creator_id: raw.creator_id,
        title: raw.title,
        description: raw.description ?? null,
        hashtag: raw.hashtag,
        scheduled_at: raw.scheduled_at,
        duration_minutes: raw.duration_minutes ?? null,
        is_cancelled: raw.is_cancelled,
        created_at: raw.created_at,
        creator_username: profiles?.username ?? 'unknown',
        creator_display_name: profiles?.display_name ?? null,
        creator_avatar_url: profiles?.avatar_url ?? null,
    };
}

// ================================================================
// フォロー クエリ
// ================================================================

/**
 * 指定ユーザーのフォロワー数・フォロー中数を返す
 */
export async function getFollowCounts(
    supabase: SupabaseClient<Database>,
    profileId: string,
): Promise<{ followers: number; following: number }> {
    const [followersRes, followingRes] = await Promise.all([
        supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('following_id', profileId),
        supabase
            .from('follows')
            .select('following_id', { count: 'exact', head: true })
            .eq('follower_id', profileId),
    ]);
    return {
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
    };
}

/**
 * 現在のユーザーが対象ユーザーをフォロー中かどうかを返す
 */
export async function checkIsFollowing(
    supabase: SupabaseClient<Database>,
    followerId: string,
    followingId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();
    return data !== null;
}

/**
 * 指定ユーザーがフォロー中のユーザーID一覧を返す（タイムラインフィルター用）
 */
export async function getFollowingIds(
    supabase: SupabaseClient<Database>,
    userId: string,
): Promise<string[]> {
    const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);
    return (data ?? []).map((r) => r.following_id);
}

// ================================================================
// アニメ クエリ
// ================================================================

export interface AnimeListOptions {
    season?: string;
    genre?: string;
    studio?: string;
    producer?: string;
    status?: 'airing' | 'finished' | 'upcoming';
    limit?: number;
    userId?: string | null;
    query?: string;
}

/**
 * アニメ一覧を取得する（season / status フィルター対応）
 */
export async function getAnimeList(
    supabase: SupabaseClient<Database>,
    options: AnimeListOptions = {},
): Promise<Anime[]> {
    const { season, genre, studio, producer, status, limit = 20, userId, query: searchQuery } = options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
        .from('anime')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (season) query = query.eq('season', season);
    if (genre) query = query.contains('genre', [genre]);
    if (studio) query = query.contains('studio', [studio]);
    if (producer) query = query.contains('producer', [producer]);
    if (status) query = query.eq('status', status);
    if (searchQuery) query = query.or(`title.ilike.%${searchQuery}%,title_en.ilike.%${searchQuery}%`);

    const { data, error } = await query;
    if (error || !data) return [];

    const animes: Anime[] = (data as Record<string, unknown>[]).map(toAnime);
    if (userId) return enrichAnimeWithUserEntries(supabase, animes, userId);
    return animes;
}

/**
 * アニメ詳細を取得する（全集計フィールド + ログインユーザーのエントリ付き）
 */
export async function getAnime(
    supabase: SupabaseClient<Database>,
    animeId: string,
    userId?: string | null,
): Promise<Anime | null> {
    const { data, error } = await supabase
        .from('anime')
        .select('*')
        .eq('id', animeId)
        .maybeSingle();

    if (error || !data) return null;

    const anime = toAnime(data as Record<string, unknown>);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [popularityRes, trendingRes, topRatedRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('anime_popularity') as any).select('list_count').eq('anime_id', animeId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('anime_trending') as any).select('recent_count').eq('anime_id', animeId).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('anime_top_rated') as any).select('avg_score, score_count').eq('anime_id', animeId).maybeSingle(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anime.list_count = (popularityRes.data as any)?.list_count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anime.recent_count = (trendingRes.data as any)?.recent_count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anime.avg_score = (topRatedRes.data as any)?.avg_score ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anime.score_count = (topRatedRes.data as any)?.score_count ?? 0;

    if (userId) {
        const { data: entry } = await supabase
            .from('user_anime_list')
            .select('status, score, progress, updated_at')
            .eq('anime_id', animeId)
            .eq('user_id', userId)
            .maybeSingle();
        anime.user_entry = entry
            ? ({
                  status: entry.status as AnimeStatus,
                  score: entry.score,
                  progress: entry.progress,
                  updated_at: entry.updated_at,
              } satisfies UserAnimeEntry)
            : null;
    }

    return anime;
}

/**
 * 人気ランキング（総マイリスト登録数順）
 */
export async function getAnimeRankingPopularity(
    supabase: SupabaseClient<Database>,
    limit = 20,
): Promise<Anime[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rankData } = await (supabase.from('anime_popularity') as any)
        .select('anime_id, list_count')
        .order('list_count', { ascending: false })
        .limit(limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(rankData as any[])?.length) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd = rankData as any[];

    const countMap = new Map(rd.map((r) => [r.anime_id as string, r.list_count as number]));
    const animes = await fetchAnimesByIds(supabase, rd.map((r) => r.anime_id as string));
    return animes.map((a) => ({ ...a, list_count: countMap.get(a.id) ?? 0 }));
}

/**
 * トレンドランキング（直近7日間のアクティビティ順）
 */
export async function getAnimeRankingTrending(
    supabase: SupabaseClient<Database>,
    limit = 20,
): Promise<Anime[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rankData } = await (supabase.from('anime_trending') as any)
        .select('anime_id, recent_count')
        .order('recent_count', { ascending: false })
        .limit(limit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd2 = (rankData as any[]) ?? [];
    if (!rd2.length) return [];

    const countMap = new Map(rd2.map((r) => [r.anime_id as string, r.recent_count as number]));
    const animes = await fetchAnimesByIds(supabase, rd2.map((r) => r.anime_id as string));
    return animes.map((a) => ({ ...a, recent_count: countMap.get(a.id) ?? 0 }));
}

/**
 * 高評価ランキング（平均スコア順）
 */
export async function getAnimeRankingTopRated(
    supabase: SupabaseClient<Database>,
    limit = 20,
): Promise<Anime[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rankData } = await (supabase.from('anime_top_rated') as any)
        .select('anime_id, avg_score, score_count')
        .order('avg_score', { ascending: false })
        .limit(limit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd3 = (rankData as any[]) ?? [];
    if (!rd3.length) return [];

    const avgMap = new Map(rd3.map((r) => [r.anime_id as string, r.avg_score as number | null]));
    const cntMap = new Map(rd3.map((r) => [r.anime_id as string, r.score_count as number]));
    const animes = await fetchAnimesByIds(supabase, rd3.map((r) => r.anime_id as string));
    return animes.map((a) => ({
        ...a,
        avg_score: avgMap.get(a.id) ?? null,
        score_count: cntMap.get(a.id) ?? 0,
    }));
}

/**
 * ユーザーのマイリストを取得する
 */
export async function getUserAnimeList(
    supabase: SupabaseClient<Database>,
    userId: string,
    status?: AnimeStatus,
): Promise<Anime[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
        .from('user_anime_list')
        .select('status, score, progress, updated_at, anime:anime_id(*)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => ({
        ...toAnime(row.anime),
        user_entry: {
            status: row.status as AnimeStatus,
            score: row.score as number | null,
            progress: row.progress as number,
            updated_at: row.updated_at as string,
        } satisfies UserAnimeEntry,
    }));
}

// ── ヘルパー ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAnime(raw: any): Anime {
    return {
        id: raw.id,
        title: raw.title,
        title_en: raw.title_en ?? null,
        title_romaji: raw.title_romaji ?? null,
        synopsis: raw.synopsis ?? null,
        cover_url: raw.cover_url ?? null,
        season: raw.season ?? null,
        episode_count: raw.episode_count ?? null,
        type: raw.type ?? null,
        status: raw.status ?? null,
        aired_from: raw.aired_from ?? null,
        aired_to: raw.aired_to ?? null,
        source: raw.source ?? null,
        studio: raw.studio ?? null,
        producer: raw.producer ?? null,
        genre: raw.genre ?? null,
        official_site_url: raw.official_site_url ?? null,
        official_x_url: raw.official_x_url ?? null,
        official_hashtag: raw.official_hashtag ?? null,
        copyright: raw.copyright ?? null,
        created_at: raw.created_at,
    };
}

async function fetchAnimesByIds(
    supabase: SupabaseClient<Database>,
    ids: string[],
): Promise<Anime[]> {
    if (ids.length === 0) return [];
    const { data } = await supabase.from('anime').select('*').in('id', ids);
    if (!data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map((data as any[]).map((a) => [a.id as string, toAnime(a)]));
    return ids.map((id) => map.get(id)).filter((a): a is Anime => a !== undefined);
}

async function enrichAnimeWithUserEntries(
    supabase: SupabaseClient<Database>,
    animes: Anime[],
    userId: string,
): Promise<Anime[]> {
    const animeIds = animes.map((a) => a.id);
    const { data } = await supabase
        .from('user_anime_list')
        .select('anime_id, status, score, progress, updated_at')
        .eq('user_id', userId)
        .in('anime_id', animeIds);

    const entryMap = new Map(
        (data ?? []).map((e) => [
            e.anime_id,
            {
                status: e.status as AnimeStatus,
                score: e.score as number | null,
                progress: e.progress,
                updated_at: e.updated_at,
            } satisfies UserAnimeEntry,
        ]),
    );

    return animes.map((a) => ({ ...a, user_entry: entryMap.get(a.id) ?? null }));
}

