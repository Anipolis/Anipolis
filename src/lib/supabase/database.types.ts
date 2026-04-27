export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    username: string;
                    display_name: string | null;
                    avatar_url: string | null;
                    bio: string | null;
                    created_at: string;
                    list_is_public: boolean;
                };
                Insert: {
                    id: string;
                    username: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    bio?: string | null;
                    created_at?: string;
                    list_is_public?: boolean;
                };
                Update: {
                    username?: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    bio?: string | null;
                    list_is_public?: boolean;
                };
                Relationships: [];
            };
            posts: {
                Row: {
                    id: string;
                    user_id: string;
                    content: string;
                    created_at: string;
                    parent_id: string | null;
                    image_urls: string[];
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    content: string;
                    created_at?: string;
                    parent_id?: string | null;
                    image_urls?: string[];
                };
                Update: {
                    content?: string;
                    parent_id?: string | null;
                    image_urls?: string[];
                };
                Relationships: [
                    {
                        foreignKeyName: 'posts_user_id_fkey';
                        columns: ['user_id'];
                        isOneToOne: false;
                        referencedRelation: 'profiles';
                        referencedColumns: ['id'];
                    },
                ];
            };
            hashtags: {
                Row: {
                    id: number;
                    name: string;
                };
                Insert: {
                    id?: number;
                    name: string;
                };
                Update: {
                    name?: string;
                };
                Relationships: [];
            };
            post_hashtags: {
                Row: {
                    post_id: string;
                    hashtag_id: number;
                };
                Insert: {
                    post_id: string;
                    hashtag_id: number;
                };
                Update: {
                    post_id?: string;
                    hashtag_id?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: 'post_hashtags_post_id_fkey';
                        columns: ['post_id'];
                        isOneToOne: false;
                        referencedRelation: 'posts';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'post_hashtags_hashtag_id_fkey';
                        columns: ['hashtag_id'];
                        isOneToOne: false;
                        referencedRelation: 'hashtags';
                        referencedColumns: ['id'];
                    },
                ];
            };
            likes: {
                Row: {
                    post_id: string;
                    user_id: string;
                    created_at: string;
                };
                Insert: {
                    post_id: string;
                    user_id: string;
                    created_at?: string;
                };
                Update: {
                    post_id?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            reposts: {
                Row: {
                    post_id: string;
                    user_id: string;
                    created_at: string;
                };
                Insert: {
                    post_id: string;
                    user_id: string;
                    created_at?: string;
                };
                Update: {
                    post_id?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            notifications: {
                Row: {
                    id: string;
                    recipient_id: string;
                    actor_id: string;
                    type: 'like' | 'repost' | 'reply';
                    post_id: string;
                    read: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    recipient_id: string;
                    actor_id: string;
                    type: 'like' | 'repost' | 'reply';
                    post_id: string;
                    read?: boolean;
                    created_at?: string;
                };
                Update: {
                    read?: boolean;
                };
                Relationships: [];
            };
            follows: {
                Row: {
                    follower_id: string;
                    following_id: string;
                    created_at: string;
                };
                Insert: {
                    follower_id: string;
                    following_id: string;
                    created_at?: string;
                };
                Update: {
                    follower_id?: string;
                    following_id?: string;
                };
                Relationships: [];
            };
            events: {
                Row: {
                    id: string;
                    creator_id: string;
                    title: string;
                    description: string | null;
                    hashtag: string;
                    scheduled_at: string;
                    duration_minutes: number | null;
                    is_cancelled: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    creator_id: string;
                    title: string;
                    description?: string | null;
                    hashtag: string;
                    scheduled_at: string;
                    duration_minutes?: number | null;
                    is_cancelled?: boolean;
                    created_at?: string;
                };
                Update: {
                    title?: string;
                    description?: string | null;
                    hashtag?: string;
                    scheduled_at?: string;
                    duration_minutes?: number | null;
                    is_cancelled?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: 'events_creator_id_fkey';
                        columns: ['creator_id'];
                        isOneToOne: false;
                        referencedRelation: 'profiles';
                        referencedColumns: ['id'];
                    },
                ];
            };
            anime: {
                Row: {
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
                    studio: string | null;
                    producer: string | null;
                    genre: string[] | null;
                    official_site_url: string | null;
                    official_x_url: string | null;
                    official_hashtag: string | null;
                    copyright: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    title: string;
                    title_en?: string | null;
                    title_romaji?: string | null;
                    synopsis?: string | null;
                    cover_url?: string | null;
                    season?: string | null;
                    episode_count?: number | null;
                    type?: string | null;
                    status?: string | null;
                    aired_from?: string | null;
                    aired_to?: string | null;
                    source?: string | null;
                    studio?: string | null;
                    producer?: string | null;
                    genre?: string[] | null;
                    official_site_url?: string | null;
                    official_x_url?: string | null;
                    official_hashtag?: string | null;
                    copyright?: string | null;
                    created_at?: string;
                };
                Update: {
                    title?: string;
                    title_en?: string | null;
                    title_romaji?: string | null;
                    synopsis?: string | null;
                    cover_url?: string | null;
                    season?: string | null;
                    episode_count?: number | null;
                    type?: string | null;
                    status?: string | null;
                    aired_from?: string | null;
                    aired_to?: string | null;
                    source?: string | null;
                    studio?: string | null;
                    producer?: string | null;
                    genre?: string[] | null;
                    official_site_url?: string | null;
                    official_x_url?: string | null;
                    official_hashtag?: string | null;
                    copyright?: string | null;
                };
                Relationships: [];
            };
            user_anime_list: {
                Row: {
                    user_id: string;
                    anime_id: string;
                    status: 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';
                    score: number | null;
                    progress: number;
                    updated_at: string;
                };
                Insert: {
                    user_id: string;
                    anime_id: string;
                    status: 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';
                    score?: number | null;
                    progress?: number;
                    updated_at?: string;
                };
                Update: {
                    status?: 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';
                    score?: number | null;
                    progress?: number;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'user_anime_list_user_id_fkey';
                        columns: ['user_id'];
                        isOneToOne: false;
                        referencedRelation: 'profiles';
                        referencedColumns: ['id'];
                    },
                    {
                        foreignKeyName: 'user_anime_list_anime_id_fkey';
                        columns: ['anime_id'];
                        isOneToOne: false;
                        referencedRelation: 'anime';
                        referencedColumns: ['id'];
                    },
                ];
            };
        };
        Views: Record<string, never>;
        Functions: {
            get_trending_hashtags: {
                Args: { limit_count?: number };
                Returns: { name: string; post_count: number }[];
            };
        };
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
};
