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
					is_private: boolean;
					is_admin: boolean;
				};
				Insert: {
					id: string;
					username: string;
					display_name?: string | null;
					avatar_url?: string | null;
					bio?: string | null;
					created_at?: string;
					list_is_public?: boolean;
					is_private?: boolean;
					is_admin?: boolean;
				};
				Update: {
					username?: string;
					display_name?: string | null;
					avatar_url?: string | null;
					bio?: string | null;
					list_is_public?: boolean;
					is_private?: boolean;
					is_admin?: boolean;
				};
				Relationships: [];
			};
			account_moderation: {
				Row: {
					user_id: string;
					status: "active" | "restricted" | "banned";
					restricted_until: string | null;
					reason: string | null;
					moderated_by: string | null;
					moderated_at: string | null;
					updated_at: string;
				};
				Insert: {
					user_id: string;
					status?: "active" | "restricted" | "banned";
					restricted_until?: string | null;
					reason?: string | null;
					moderated_by?: string | null;
					moderated_at?: string | null;
					updated_at?: string;
				};
				Update: {
					status?: "active" | "restricted" | "banned";
					restricted_until?: string | null;
					reason?: string | null;
					moderated_by?: string | null;
					moderated_at?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "account_moderation_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: true;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "account_moderation_moderated_by_fkey";
						columns: ["moderated_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			posts: {
				Row: {
					id: string;
					user_id: string;
					content: string;
					created_at: string;
					parent_id: string | null;
					quoted_post_id: string | null;
					image_urls: string[];
					anime_id: number | null;
					exchange_share: Json | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					content: string;
					created_at?: string;
					parent_id?: string | null;
					quoted_post_id?: string | null;
					image_urls?: string[];
					anime_id?: number | null;
					exchange_share?: Json | null;
				};
				Update: {
					content?: string;
					parent_id?: string | null;
					quoted_post_id?: string | null;
					image_urls?: string[];
					anime_id?: number | null;
					exchange_share?: Json | null;
				};
				Relationships: [
					{
						foreignKeyName: "posts_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_quoted_post_id_fkey";
						columns: ["quoted_post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
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
						foreignKeyName: "post_hashtags_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "post_hashtags_hashtag_id_fkey";
						columns: ["hashtag_id"];
						isOneToOne: false;
						referencedRelation: "hashtags";
						referencedColumns: ["id"];
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
			bookmarks: {
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
			follow_requests: {
				Row: {
					requester_id: string;
					target_id: string;
					status: "pending";
					created_at: string;
				};
				Insert: {
					requester_id: string;
					target_id: string;
					status?: "pending";
					created_at?: string;
				};
				Update: {
					status?: "pending";
				};
				Relationships: [
					{
						foreignKeyName: "follow_requests_requester_id_fkey";
						columns: ["requester_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "follow_requests_target_id_fkey";
						columns: ["target_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			reports: {
				Row: {
					id: string;
					reporter_id: string;
					target_type: "post" | "user";
					target_id: string;
					target_user_id: string | null;
					reason: "spam" | "harassment" | "sexual" | "violence" | "illegal" | "other";
					details: string | null;
					status: "open" | "reviewing" | "resolved" | "rejected";
					resolved_by: string | null;
					resolved_at: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					reporter_id: string;
					target_type: "post" | "user";
					target_id: string;
					target_user_id?: string | null;
					reason: "spam" | "harassment" | "sexual" | "violence" | "illegal" | "other";
					details?: string | null;
					status?: "open" | "reviewing" | "resolved" | "rejected";
					resolved_by?: string | null;
					resolved_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					target_user_id?: string | null;
					reason?: "spam" | "harassment" | "sexual" | "violence" | "illegal" | "other";
					details?: string | null;
					status?: "open" | "reviewing" | "resolved" | "rejected";
					resolved_by?: string | null;
					resolved_at?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "reports_reporter_id_fkey";
						columns: ["reporter_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "reports_target_user_id_fkey";
						columns: ["target_user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "reports_resolved_by_fkey";
						columns: ["resolved_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			admin_audit_logs: {
				Row: {
					id: string;
					admin_id: string;
					action: string;
					target_type: string;
					target_id: string;
					metadata: Json;
					created_at: string;
				};
				Insert: {
					id?: string;
					admin_id: string;
					action: string;
					target_type: string;
					target_id: string;
					metadata?: Json;
					created_at?: string;
				};
				Update: {
					action?: string;
					target_type?: string;
					target_id?: string;
					metadata?: Json;
				};
				Relationships: [
					{
						foreignKeyName: "admin_audit_logs_admin_id_fkey";
						columns: ["admin_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			notifications: {
				Row: {
					id: string;
					recipient_id: string;
					actor_id: string;
					type: "like" | "repost" | "reply" | "mention" | "follow" | "anime_recommendation";
					post_id: string | null;
					anime_recommendation_id: string | null;
					read: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					recipient_id: string;
					actor_id: string;
					type: "like" | "repost" | "reply" | "mention" | "follow" | "anime_recommendation";
					post_id?: string | null;
					anime_recommendation_id?: string | null;
					read?: boolean;
					created_at?: string;
				};
				Update: {
					read?: boolean;
					post_id?: string | null;
					anime_recommendation_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "notifications_anime_recommendation_id_fkey";
						columns: ["anime_recommendation_id"];
						isOneToOne: false;
						referencedRelation: "anime_recommendations";
						referencedColumns: ["id"];
					},
				];
			};
			anime_recommendations: {
				Row: {
					id: string;
					recommender_id: string;
					recipient_id: string;
					anime_id: number;
					created_at: string;
				};
				Insert: {
					id?: string;
					recommender_id: string;
					recipient_id: string;
					anime_id: number;
					created_at?: string;
				};
				Update: Record<string, never>;
				Relationships: [
					{
						foreignKeyName: "anime_recommendations_recommender_id_fkey";
						columns: ["recommender_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_recommendations_recipient_id_fkey";
						columns: ["recipient_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
				];
			};
			anime_exchange_entries: {
				Row: {
					id: string;
					user_id: string;
					anime_id: number;
					status: "waiting" | "matched" | "cancelled";
					received_entry_id: string | null;
					created_at: string;
					matched_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					anime_id: number;
					status?: "waiting" | "matched" | "cancelled";
					received_entry_id?: string | null;
					created_at?: string;
					matched_at?: string | null;
				};
				Update: {
					status?: "waiting" | "matched" | "cancelled";
					received_entry_id?: string | null;
					matched_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "anime_exchange_entries_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_received_entry_id_fkey";
						columns: ["received_entry_id"];
						isOneToOne: false;
						referencedRelation: "anime_exchange_entries";
						referencedColumns: ["id"];
					},
				];
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
				Relationships: [
					{
						foreignKeyName: "follows_follower_id_fkey";
						columns: ["follower_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "follows_following_id_fkey";
						columns: ["following_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			muted_words: {
				Row: {
					id: string;
					user_id: string;
					word: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					word: string;
					created_at?: string;
				};
				Update: {
					word?: string;
				};
				Relationships: [
					{
						foreignKeyName: "muted_words_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
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
					anime_id: number | null;
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
					anime_id?: number | null;
				};
				Update: {
					title?: string;
					description?: string | null;
					hashtag?: string;
					scheduled_at?: string;
					duration_minutes?: number | null;
					is_cancelled?: boolean;
					anime_id?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: "events_creator_id_fkey";
						columns: ["creator_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
				];
			};
			anime: {
				Row: {
					id: number;
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
				};
				Insert: {
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
					studio?: string[] | null;
					producer?: string[] | null;
					genre?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					official_hashtag?: string[] | null;
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
					studio?: string[] | null;
					producer?: string[] | null;
					genre?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					official_hashtag?: string[] | null;
					copyright?: string | null;
				};
				Relationships: [];
			};
			user_anime_list: {
				Row: {
					user_id: string;
					anime_id: number;
					status: "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold";
					score: number | null;
					progress: number;
					updated_at: string;
				};
				Insert: {
					user_id: string;
					anime_id: number;
					status: "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold";
					score?: number | null;
					progress?: number;
					updated_at?: string;
				};
				Update: {
					status?: "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold";
					score?: number | null;
					progress?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "user_anime_list_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: {
			anime_popularity: {
				Row: {
					anime_id: number;
					list_count: number;
				};
				Relationships: [];
			};
			anime_trending: {
				Row: {
					anime_id: number;
					recent_count: number;
				};
				Relationships: [];
			};
			anime_top_rated: {
				Row: {
					anime_id: number;
					avg_score: number;
					score_count: number;
				};
				Relationships: [];
			};
		};
		Functions: {
			get_trending_hashtags: {
				Args: { limit_count?: number };
				Returns: { name: string; post_count: number }[];
			};
			create_anime_exchange: {
				Args: { p_anime_id: number };
				Returns: {
					exchange_id: string;
					received_entry_id: string | null;
					received_anime_id: number | null;
				}[];
			};
		};
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};
