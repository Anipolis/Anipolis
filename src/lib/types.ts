// ================================================================
// アプリ共通型定義
// ================================================================

export interface Profile {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    list_is_public: boolean;
}

export interface UserAnimeListEntry {
    anime_id: string;
    status: AnimeStatus;
    score: number | null;
    progress: number;
    updated_at: string;
    anime: {
        id: string;
        title: string;
        cover_url: string | null;
        episode_count: number | null;
    };
}

export interface AnimeQuote {
    id: string;
    title: string;
    cover_url: string | null;
    /** 閲覧者自身のスコア（enrichPostsWithCounts で付加） */
    user_score: number | null;
}

export interface Post {
    id: string;
    user_id: string;
    parent_id: string | null;
    content: string;
    created_at: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    hashtags: string[];
    image_urls: string[];
    like_count: number;
    repost_count: number;
    reply_count: number;
    liked_by_me: boolean;
    reposted_by_me: boolean;
    anime_id: string | null;
    anime_quote: AnimeQuote | null;
}

export interface TrendingHashtag {
    name: string;
    post_count: number;
}

export interface Notification {
    id: string;
    type: 'like' | 'repost' | 'reply';
    post_id: string;
    read: boolean;
    created_at: string;
    // actor (通知を発生させたユーザー)
    actor_username: string;
    actor_display_name: string | null;
    actor_avatar_url: string | null;
    // 対象投稿の冒頭テキスト (表示用)
    post_content: string;
}

export interface Event {
    id: string;
    creator_id: string;
    title: string;
    description: string | null;
    hashtag: string;          // # なし (例: "AnimeOP2026")
    scheduled_at: string;     // ISO 8601
    duration_minutes: number | null;
    is_cancelled: boolean;
    created_at: string;
    // JOIN で付加されるフィールド（任意）
    creator_username?: string;
    creator_display_name?: string | null;
    creator_avatar_url?: string | null;
}

// ----------------------------------------------------------------
// アニメDB
// ----------------------------------------------------------------

export type AnimeStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';

export interface UserAnimeEntry {
    status: AnimeStatus;
    score: number | null;
    progress: number;
    updated_at: string;
}

export interface Anime {
    id: string;
    title: string;
    title_en: string | null;
    title_romaji: string | null;
    synopsis: string | null;
    cover_url: string | null;
    season: string | null;
    episode_count: number | null;
    type: string | null;
    status: string | null;
    aired_from: string | null;
    aired_to: string | null;
    source: string | null;
    studio: string[] | null;
    producer: string[] | null;
    genre: string[] | null;
    official_site_url: string | null;
    official_x_url: string | null;
    official_hashtag: string[] | null;
    copyright: string | null;
    created_at: string;
    // 集計フィールド（クエリ時に付加）
    list_count?: number;
    recent_count?: number;
    avg_score?: number | null;
    score_count?: number;
    // ログインユーザーのマイリスト状態
    user_entry?: UserAnimeEntry | null;
}

// ----------------------------------------------------------------
// Supabase のネストクエリ結果を Post に変換するユーティリティ
export function toPost(
    raw: {
        id: string;
        user_id: string;
        parent_id?: string | null;
        content: string;
        created_at: string;
        image_urls?: string[] | null;
        anime_id?: string | null;
        anime?: {
            id: string;
            title: string;
            cover_url: string | null;
        } | null;
        profiles: {
            username: string;
            display_name: string | null;
            avatar_url: string | null;
        } | null;
        post_hashtags: {
            hashtags: { name: string } | null;
        }[];
    },
    counts?: {
        like_count?: number;
        repost_count?: number;
        reply_count?: number;
        liked_by_me?: boolean;
        reposted_by_me?: boolean;
    },
): Post {
    return {
        id: raw.id,
        user_id: raw.user_id,
        parent_id: raw.parent_id ?? null,
        content: raw.content,
        created_at: raw.created_at,
        image_urls: raw.image_urls ?? [],
        username: raw.profiles?.username ?? 'unknown',
        display_name: raw.profiles?.display_name ?? null,
        avatar_url: raw.profiles?.avatar_url ?? null,
        hashtags: raw.post_hashtags
            .map((ph) => ph.hashtags?.name)
            .filter((name): name is string => name !== undefined && name !== null),
        like_count: counts?.like_count ?? 0,
        repost_count: counts?.repost_count ?? 0,
        reply_count: counts?.reply_count ?? 0,
        liked_by_me: counts?.liked_by_me ?? false,
        reposted_by_me: counts?.reposted_by_me ?? false,
        anime_id: raw.anime_id ?? null,
        anime_quote: raw.anime
            ? { id: raw.anime.id, title: raw.anime.title, cover_url: raw.anime.cover_url, user_score: null }
            : null,
    };
}
