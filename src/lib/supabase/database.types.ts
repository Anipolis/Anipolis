export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.5";
	};
	public: {
		Tables: {
			account_moderation: {
				Row: {
					moderated_at: string | null;
					moderated_by: string | null;
					reason: string | null;
					restricted_until: string | null;
					status: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					moderated_at?: string | null;
					moderated_by?: string | null;
					reason?: string | null;
					restricted_until?: string | null;
					status?: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					moderated_at?: string | null;
					moderated_by?: string | null;
					reason?: string | null;
					restricted_until?: string | null;
					status?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "account_moderation_moderated_by_fkey";
						columns: ["moderated_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "account_moderation_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: true;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			admin_audit_logs: {
				Row: {
					action: string;
					admin_id: string;
					created_at: string;
					id: string;
					metadata: Json;
					target_id: string;
					target_type: string;
				};
				Insert: {
					action: string;
					admin_id: string;
					created_at?: string;
					id?: string;
					metadata?: Json;
					target_id: string;
					target_type: string;
				};
				Update: {
					action?: string;
					admin_id?: string;
					created_at?: string;
					id?: string;
					metadata?: Json;
					target_id?: string;
					target_type?: string;
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
			anime: {
				Row: {
					aired_from: string | null;
					aired_to: string | null;
					broadcast_day: number | null;
					broadcast_duration_minutes: number;
					broadcast_room_post_close_minutes: number;
					broadcast_room_pre_open_minutes: number;
					broadcast_station: string[] | null;
					broadcast_time: string | null;
					copyright: string | null;
					cover_source_url: string | null;
					cover_url: string | null;
					created_at: string | null;
					episode_count: string | null;
					genre: string[] | null;
					genre_en: string[] | null;
					hidden_by_admin: boolean;
					id: number;
					mal_id: number | null;
					metadata_ready: boolean;
					official_hashtag: string[] | null;
					official_site_url: string | null;
					official_x_url: string | null;
					producer: string[] | null;
					resources: Json;
					room_type: string;
					room_type_source: string;
					season: string | null;
					source: string | null;
					status: string;
					studio: string[] | null;
					studio_en: string[] | null;
					synopsis: string | null;
					title: string;
					title_en: string | null;
					title_romaji: string | null;
					title_yomi: string | null;
					type: string | null;
				};
				Insert: {
					aired_from?: string | null;
					aired_to?: string | null;
					broadcast_day?: number | null;
					broadcast_duration_minutes?: number;
					broadcast_room_post_close_minutes?: number;
					broadcast_room_pre_open_minutes?: number;
					broadcast_station?: string[] | null;
					broadcast_time?: string | null;
					copyright?: string | null;
					cover_source_url?: string | null;
					cover_url?: string | null;
					created_at?: string | null;
					episode_count?: string | null;
					genre?: string[] | null;
					genre_en?: string[] | null;
					hidden_by_admin?: boolean;
					id?: never;
					mal_id?: number | null;
					metadata_ready?: boolean;
					official_hashtag?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					producer?: string[] | null;
					resources?: Json;
					room_type?: string;
					room_type_source?: string;
					season?: string | null;
					source?: string | null;
					status?: string;
					studio?: string[] | null;
					studio_en?: string[] | null;
					synopsis?: string | null;
					title: string;
					title_en?: string | null;
					title_romaji?: string | null;
					title_yomi?: string | null;
					type?: string | null;
				};
				Update: {
					aired_from?: string | null;
					aired_to?: string | null;
					broadcast_day?: number | null;
					broadcast_duration_minutes?: number;
					broadcast_room_post_close_minutes?: number;
					broadcast_room_pre_open_minutes?: number;
					broadcast_station?: string[] | null;
					broadcast_time?: string | null;
					copyright?: string | null;
					cover_source_url?: string | null;
					cover_url?: string | null;
					created_at?: string | null;
					episode_count?: string | null;
					genre?: string[] | null;
					genre_en?: string[] | null;
					hidden_by_admin?: boolean;
					id?: never;
					mal_id?: number | null;
					metadata_ready?: boolean;
					official_hashtag?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					producer?: string[] | null;
					resources?: Json;
					room_type?: string;
					room_type_source?: string;
					season?: string | null;
					source?: string | null;
					status?: string;
					studio?: string[] | null;
					studio_en?: string[] | null;
					synopsis?: string | null;
					title?: string;
					title_en?: string | null;
					title_romaji?: string | null;
					title_yomi?: string | null;
					type?: string | null;
				};
				Relationships: [];
			};
			anime_copyright_reviews: {
				Row: {
					anime_id: number;
					candidates: Json;
					created_at: string;
					id: number;
					kind: string;
					note: string | null;
					resolution: string | null;
					resolved_at: string | null;
					resolved_by: string | null;
					resolved_copyright: string | null;
					status: string;
				};
				Insert: {
					anime_id: number;
					candidates?: Json;
					created_at?: string;
					id?: never;
					kind: string;
					note?: string | null;
					resolution?: string | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
					resolved_copyright?: string | null;
					status?: string;
				};
				Update: {
					anime_id?: number;
					candidates?: Json;
					created_at?: string;
					id?: never;
					kind?: string;
					note?: string | null;
					resolution?: string | null;
					resolved_at?: string | null;
					resolved_by?: string | null;
					resolved_copyright?: string | null;
					status?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_copyright_reviews_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_copyright_reviews_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_copyright_reviews_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_copyright_reviews_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_copyright_reviews_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
				];
			};
			anime_cover_assets: {
				Row: {
					anime_id: number;
					bytes: number;
					fetched_at: string;
					height: number;
					id: number;
					mal_id: number | null;
					object_name: string;
					published_at: string | null;
					review_reason: string | null;
					review_status: string;
					sha256: string;
					source: string;
					source_api_url: string;
					source_height: number;
					source_image_url: string;
					source_width: number;
					updated_at: string;
					width: number;
				};
				Insert: {
					anime_id: number;
					bytes: number;
					fetched_at?: string;
					height: number;
					id?: number;
					mal_id?: number | null;
					object_name: string;
					published_at?: string | null;
					review_reason?: string | null;
					review_status?: string;
					sha256: string;
					source: string;
					source_api_url: string;
					source_height: number;
					source_image_url: string;
					source_width: number;
					updated_at?: string;
					width: number;
				};
				Update: {
					anime_id?: number;
					bytes?: number;
					fetched_at?: string;
					height?: number;
					id?: number;
					mal_id?: number | null;
					object_name?: string;
					published_at?: string | null;
					review_reason?: string | null;
					review_status?: string;
					sha256?: string;
					source?: string;
					source_api_url?: string;
					source_height?: number;
					source_image_url?: string;
					source_width?: number;
					updated_at?: string;
					width?: number;
				};
				Relationships: [
					{
						foreignKeyName: "anime_cover_assets_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_cover_assets_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_cover_assets_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_cover_assets_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_cover_assets_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
				];
			};
			anime_data_attributions: {
				Row: {
					anime_mal_id: number;
					label: string;
					license_label: string | null;
					license_url: string | null;
					source: string;
					source_url: string;
				};
				Insert: {
					anime_mal_id: number;
					label: string;
					license_label?: string | null;
					license_url?: string | null;
					source: string;
					source_url: string;
				};
				Update: {
					anime_mal_id?: number;
					label?: string;
					license_label?: string | null;
					license_url?: string | null;
					source?: string;
					source_url?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_data_attributions_anime_mal_id_fkey";
						columns: ["anime_mal_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["mal_id"];
					},
					{
						foreignKeyName: "anime_data_attributions_anime_mal_id_fkey";
						columns: ["anime_mal_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["mal_id"];
					},
				];
			};
			anime_exchange_entries: {
				Row: {
					anime_id: number;
					comment: string | null;
					created_at: string;
					id: string;
					matched_at: string | null;
					received_entry_id: string | null;
					status: string;
					subjective_tags: string[];
					user_id: string;
				};
				Insert: {
					anime_id: number;
					comment?: string | null;
					created_at?: string;
					id?: string;
					matched_at?: string | null;
					received_entry_id?: string | null;
					status?: string;
					subjective_tags?: string[];
					user_id: string;
				};
				Update: {
					anime_id?: number;
					comment?: string | null;
					created_at?: string;
					id?: string;
					matched_at?: string | null;
					received_entry_id?: string | null;
					status?: string;
					subjective_tags?: string[];
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_received_entry_id_fkey";
						columns: ["received_entry_id"];
						isOneToOne: false;
						referencedRelation: "anime_exchange_entries";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_exchange_entries_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			anime_external_mappings: {
				Row: {
					evidence: Json;
					external_key: string;
					external_source: string;
					imported_at: string;
					is_primary: boolean;
					mal_id: number;
					match_method: string;
					match_status: string;
					reviewed_at: string | null;
					source_url: string;
					source_version: string | null;
					use_for_title: boolean;
					valid_from: string | null;
					valid_to: string | null;
				};
				Insert: {
					evidence?: Json;
					external_key: string;
					external_source: string;
					imported_at?: string;
					is_primary?: boolean;
					mal_id: number;
					match_method: string;
					match_status: string;
					reviewed_at?: string | null;
					source_url: string;
					source_version?: string | null;
					use_for_title?: boolean;
					valid_from?: string | null;
					valid_to?: string | null;
				};
				Update: {
					evidence?: Json;
					external_key?: string;
					external_source?: string;
					imported_at?: string;
					is_primary?: boolean;
					mal_id?: number;
					match_method?: string;
					match_status?: string;
					reviewed_at?: string | null;
					source_url?: string;
					source_version?: string | null;
					use_for_title?: boolean;
					valid_from?: string | null;
					valid_to?: string | null;
				};
				Relationships: [];
			};
			anime_mutes: {
				Row: {
					anime_id: number;
					created_at: string;
					id: string;
					is_repeat: boolean;
					mute_type: string;
					muted_until: string | null;
					period_days: number | null;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					anime_id: number;
					created_at?: string;
					id?: string;
					is_repeat?: boolean;
					mute_type: string;
					muted_until?: string | null;
					period_days?: number | null;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					anime_id?: number;
					created_at?: string;
					id?: string;
					is_repeat?: boolean;
					mute_type?: string;
					muted_until?: string | null;
					period_days?: number | null;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
				];
			};
			anime_recommendations: {
				Row: {
					anime_id: number;
					created_at: string;
					id: string;
					message: string | null;
					recipient_id: string;
					recommender_id: string;
				};
				Insert: {
					anime_id: number;
					created_at?: string;
					id?: string;
					message?: string | null;
					recipient_id: string;
					recommender_id: string;
				};
				Update: {
					anime_id?: number;
					created_at?: string;
					id?: string;
					message?: string | null;
					recipient_id?: string;
					recommender_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "anime_recommendations_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
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
						foreignKeyName: "anime_recommendations_recommender_id_fkey";
						columns: ["recommender_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			anime_relations: {
				Row: {
					anime_mal_id: number;
					created_at: string;
					related_anime_mal_id: number;
					related_title: string;
					relation_type: string;
				};
				Insert: {
					anime_mal_id: number;
					created_at?: string;
					related_anime_mal_id: number;
					related_title: string;
					relation_type: string;
				};
				Update: {
					anime_mal_id?: number;
					created_at?: string;
					related_anime_mal_id?: number;
					related_title?: string;
					relation_type?: string;
				};
				Relationships: [
					{
						foreignKeyName: "anime_relations_anime_mal_id_fkey";
						columns: ["anime_mal_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["mal_id"];
					},
					{
						foreignKeyName: "anime_relations_anime_mal_id_fkey";
						columns: ["anime_mal_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["mal_id"];
					},
				];
			};
			anime_resolution_records: {
				Row: {
					field_sources: Json;
					mal_id: number;
					resolution_reasons: Json;
					resolution_status: string;
					resolved_at: string;
					resolved_data: Json;
				};
				Insert: {
					field_sources: Json;
					mal_id: number;
					resolution_reasons?: Json;
					resolution_status: string;
					resolved_at?: string;
					resolved_data: Json;
				};
				Update: {
					field_sources?: Json;
					mal_id?: number;
					resolution_reasons?: Json;
					resolution_status?: string;
					resolved_at?: string;
					resolved_data?: Json;
				};
				Relationships: [
					{
						foreignKeyName: "anime_resolution_records_mal_id_fkey";
						columns: ["mal_id"];
						isOneToOne: true;
						referencedRelation: "anime";
						referencedColumns: ["mal_id"];
					},
					{
						foreignKeyName: "anime_resolution_records_mal_id_fkey";
						columns: ["mal_id"];
						isOneToOne: true;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["mal_id"];
					},
				];
			};
			anime_source_records: {
				Row: {
					id: number;
					imported_at: string;
					mal_id: number;
					normalized_data: Json;
					source: string;
					source_updated_at: string | null;
					source_url: string;
					source_version: string;
				};
				Insert: {
					id?: number;
					imported_at?: string;
					mal_id: number;
					normalized_data: Json;
					source: string;
					source_updated_at?: string | null;
					source_url: string;
					source_version: string;
				};
				Update: {
					id?: number;
					imported_at?: string;
					mal_id?: number;
					normalized_data?: Json;
					source?: string;
					source_updated_at?: string | null;
					source_url?: string;
					source_version?: string;
				};
				Relationships: [];
			};
			app_config: {
				Row: {
					key: string;
					value: Json;
				};
				Insert: {
					key: string;
					value: Json;
				};
				Update: {
					key?: string;
					value?: Json;
				};
				Relationships: [];
			};
			bookmarks: {
				Row: {
					created_at: string;
					post_id: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					post_id: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					post_id?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "bookmarks_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "bookmarks_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			broadcast_notification_settings: {
				Row: {
					notify_1min: boolean;
					notify_30min: boolean;
					notify_5min: boolean;
					updated_at: string | null;
					user_id: string;
				};
				Insert: {
					notify_1min?: boolean;
					notify_30min?: boolean;
					notify_5min?: boolean;
					updated_at?: string | null;
					user_id: string;
				};
				Update: {
					notify_1min?: boolean;
					notify_30min?: boolean;
					notify_5min?: boolean;
					updated_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "broadcast_notification_settings_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: true;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			broadcast_notification_subscriptions: {
				Row: {
					anime_id: number;
					created_at: string | null;
					user_id: string;
				};
				Insert: {
					anime_id: number;
					created_at?: string | null;
					user_id: string;
				};
				Update: {
					anime_id?: number;
					created_at?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "broadcast_notification_subscriptions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_notification_subscriptions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_notification_subscriptions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_notification_subscriptions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_notification_subscriptions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_notification_subscriptions_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			broadcast_room_mutes: {
				Row: {
					anime_id: number;
					created_at: string;
					duration_days: number | null;
					mute_until_event_end: boolean;
					muted_until: string;
					repeat_weekly: boolean;
					room_date: string;
					room_session_id: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					anime_id: number;
					created_at?: string;
					duration_days?: number | null;
					mute_until_event_end?: boolean;
					muted_until: string;
					repeat_weekly?: boolean;
					room_date: string;
					room_session_id: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					anime_id?: number;
					created_at?: string;
					duration_days?: number | null;
					mute_until_event_end?: boolean;
					muted_until?: string;
					repeat_weekly?: boolean;
					room_date?: string;
					room_session_id?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "broadcast_room_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_room_session_id_fkey";
						columns: ["room_session_id"];
						isOneToOne: false;
						referencedRelation: "broadcast_room_sessions";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_room_mutes_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			broadcast_room_overrides: {
				Row: {
					anime_id: number;
					announcement_label: string | null;
					broadcast_time: string | null;
					created_at: string;
					duration_minutes: number | null;
					episode_count_increment: number | null;
					episode_end: number | null;
					episode_label: string | null;
					episode_start: number | null;
					id: string;
					is_cancelled: boolean;
					note: string | null;
					override_kind: string;
					post_close_minutes: number | null;
					pre_open_minutes: number | null;
					room_date: string;
				};
				Insert: {
					anime_id: number;
					announcement_label?: string | null;
					broadcast_time?: string | null;
					created_at?: string;
					duration_minutes?: number | null;
					episode_count_increment?: number | null;
					episode_end?: number | null;
					episode_label?: string | null;
					episode_start?: number | null;
					id?: string;
					is_cancelled?: boolean;
					note?: string | null;
					override_kind?: string;
					post_close_minutes?: number | null;
					pre_open_minutes?: number | null;
					room_date: string;
				};
				Update: {
					anime_id?: number;
					announcement_label?: string | null;
					broadcast_time?: string | null;
					created_at?: string;
					duration_minutes?: number | null;
					episode_count_increment?: number | null;
					episode_end?: number | null;
					episode_label?: string | null;
					episode_start?: number | null;
					id?: string;
					is_cancelled?: boolean;
					note?: string | null;
					override_kind?: string;
					post_close_minutes?: number | null;
					pre_open_minutes?: number | null;
					room_date?: string;
				};
				Relationships: [
					{
						foreignKeyName: "broadcast_room_overrides_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_room_overrides_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_overrides_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_overrides_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_overrides_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
				];
			};
			broadcast_room_sessions: {
				Row: {
					anime_id: number;
					created_at: string;
					duration_minutes: number;
					episode_number: number | null;
					episode_title: string | null;
					id: string;
					posting_closes_at: string;
					posting_opens_at: string;
					room_date: string;
					room_key: string;
					room_kind: string;
					schedule_correction_note: string | null;
					schedule_frozen_at: string | null;
					schedule_source: string | null;
					scheduled_at: string;
					source_channel_id: number | null;
					source_channel_name: string | null;
					source_program_id: number | null;
					source_snapshot: Json | null;
					source_title_id: number | null;
				};
				Insert: {
					anime_id: number;
					created_at?: string;
					duration_minutes: number;
					episode_number?: number | null;
					episode_title?: string | null;
					id?: string;
					posting_closes_at: string;
					posting_opens_at: string;
					room_date: string;
					room_key?: string;
					room_kind?: string;
					schedule_correction_note?: string | null;
					schedule_frozen_at?: string | null;
					schedule_source?: string | null;
					scheduled_at: string;
					source_channel_id?: number | null;
					source_channel_name?: string | null;
					source_program_id?: number | null;
					source_snapshot?: Json | null;
					source_title_id?: number | null;
				};
				Update: {
					anime_id?: number;
					created_at?: string;
					duration_minutes?: number;
					episode_number?: number | null;
					episode_title?: string | null;
					id?: string;
					posting_closes_at?: string;
					posting_opens_at?: string;
					room_date?: string;
					room_key?: string;
					room_kind?: string;
					schedule_correction_note?: string | null;
					schedule_frozen_at?: string | null;
					schedule_source?: string | null;
					scheduled_at?: string;
					source_channel_id?: number | null;
					source_channel_name?: string | null;
					source_program_id?: number | null;
					source_snapshot?: Json | null;
					source_title_id?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: "broadcast_room_sessions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "broadcast_room_sessions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_sessions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_sessions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "broadcast_room_sessions_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
				];
			};
			event_mutes: {
				Row: {
					created_at: string;
					event_id: string;
					id: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					event_id: string;
					id?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					event_id?: string;
					id?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "event_mutes_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
				];
			};
			event_notification_settings: {
				Row: {
					created_at: string;
					event_id: string;
					id: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					event_id: string;
					id?: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					event_id?: string;
					id?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "event_notification_settings_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
				];
			};
			events: {
				Row: {
					anime_id: number | null;
					created_at: string;
					creator_id: string;
					description: string | null;
					duration_minutes: number | null;
					hashtag: string;
					id: string;
					is_cancelled: boolean;
					scheduled_at: string;
					title: string;
					updated_at: string;
				};
				Insert: {
					anime_id?: number | null;
					created_at?: string;
					creator_id: string;
					description?: string | null;
					duration_minutes?: number | null;
					hashtag: string;
					id?: string;
					is_cancelled?: boolean;
					scheduled_at: string;
					title: string;
					updated_at?: string;
				};
				Update: {
					anime_id?: number | null;
					created_at?: string;
					creator_id?: string;
					description?: string | null;
					duration_minutes?: number | null;
					hashtag?: string;
					id?: string;
					is_cancelled?: boolean;
					scheduled_at?: string;
					title?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "events_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "events_creator_id_fkey";
						columns: ["creator_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			follow_requests: {
				Row: {
					created_at: string;
					requester_id: string;
					status: string;
					target_id: string;
				};
				Insert: {
					created_at?: string;
					requester_id: string;
					status?: string;
					target_id: string;
				};
				Update: {
					created_at?: string;
					requester_id?: string;
					status?: string;
					target_id?: string;
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
			follows: {
				Row: {
					created_at: string;
					follower_id: string;
					following_id: string;
				};
				Insert: {
					created_at?: string;
					follower_id: string;
					following_id: string;
				};
				Update: {
					created_at?: string;
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
					id?: number;
					name?: string;
				};
				Relationships: [];
			};
			invite_redemptions: {
				Row: {
					id: string;
					invite_id: string;
					redeemed_at: string;
					user_id: string;
				};
				Insert: {
					id?: string;
					invite_id: string;
					redeemed_at?: string;
					user_id: string;
				};
				Update: {
					id?: string;
					invite_id?: string;
					redeemed_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "invite_redemptions_invite_id_fkey";
						columns: ["invite_id"];
						isOneToOne: false;
						referencedRelation: "invites";
						referencedColumns: ["id"];
					},
				];
			};
			invites: {
				Row: {
					code: string;
					created_at: string;
					created_by: string;
					expires_at: string | null;
					id: string;
					max_uses: number;
					revoked_at: string | null;
					use_count: number;
				};
				Insert: {
					code: string;
					created_at?: string;
					created_by: string;
					expires_at?: string | null;
					id?: string;
					max_uses?: number;
					revoked_at?: string | null;
					use_count?: number;
				};
				Update: {
					code?: string;
					created_at?: string;
					created_by?: string;
					expires_at?: string | null;
					id?: string;
					max_uses?: number;
					revoked_at?: string | null;
					use_count?: number;
				};
				Relationships: [
					{
						foreignKeyName: "invites_created_by_fkey";
						columns: ["created_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			likes: {
				Row: {
					created_at: string;
					post_id: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					post_id: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					post_id?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "likes_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "likes_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			linked_accounts: {
				Row: {
					created_at: string;
					display_order: number;
					linked_user_id: string;
					owner_user_id: string;
				};
				Insert: {
					created_at?: string;
					display_order?: number;
					linked_user_id: string;
					owner_user_id: string;
				};
				Update: {
					created_at?: string;
					display_order?: number;
					linked_user_id?: string;
					owner_user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "linked_accounts_linked_user_id_fkey";
						columns: ["linked_user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "linked_accounts_owner_user_id_fkey";
						columns: ["owner_user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			muted_words: {
				Row: {
					created_at: string;
					id: string;
					user_id: string;
					word: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					user_id: string;
					word: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					user_id?: string;
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
			notifications: {
				Row: {
					actor_id: string | null;
					anime_recommendation_id: string | null;
					broadcast_anime_id: number | null;
					broadcast_offset_minutes: number | null;
					broadcast_room_date: string | null;
					broadcast_scheduled_at: string | null;
					created_at: string;
					event_id: string | null;
					exchange_anime_id: number | null;
					id: string;
					mylist_anime_id: number | null;
					mylist_status: string | null;
					post_id: string | null;
					read: boolean;
					recipient_id: string;
					type: string;
				};
				Insert: {
					actor_id?: string | null;
					anime_recommendation_id?: string | null;
					broadcast_anime_id?: number | null;
					broadcast_offset_minutes?: number | null;
					broadcast_room_date?: string | null;
					broadcast_scheduled_at?: string | null;
					created_at?: string;
					event_id?: string | null;
					exchange_anime_id?: number | null;
					id?: string;
					mylist_anime_id?: number | null;
					mylist_status?: string | null;
					post_id?: string | null;
					read?: boolean;
					recipient_id: string;
					type: string;
				};
				Update: {
					actor_id?: string | null;
					anime_recommendation_id?: string | null;
					broadcast_anime_id?: number | null;
					broadcast_offset_minutes?: number | null;
					broadcast_room_date?: string | null;
					broadcast_scheduled_at?: string | null;
					created_at?: string;
					event_id?: string | null;
					exchange_anime_id?: number | null;
					id?: string;
					mylist_anime_id?: number | null;
					mylist_status?: string | null;
					post_id?: string | null;
					read?: boolean;
					recipient_id?: string;
					type?: string;
				};
				Relationships: [
					{
						foreignKeyName: "notifications_actor_id_fkey";
						columns: ["actor_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_anime_recommendation_id_fkey";
						columns: ["anime_recommendation_id"];
						isOneToOne: false;
						referencedRelation: "anime_recommendations";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_broadcast_anime_id_fkey";
						columns: ["broadcast_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_broadcast_anime_id_fkey";
						columns: ["broadcast_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_broadcast_anime_id_fkey";
						columns: ["broadcast_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_broadcast_anime_id_fkey";
						columns: ["broadcast_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_broadcast_anime_id_fkey";
						columns: ["broadcast_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_exchange_anime_id_fkey";
						columns: ["exchange_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_exchange_anime_id_fkey";
						columns: ["exchange_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_exchange_anime_id_fkey";
						columns: ["exchange_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_exchange_anime_id_fkey";
						columns: ["exchange_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_exchange_anime_id_fkey";
						columns: ["exchange_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_mylist_anime_id_fkey";
						columns: ["mylist_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_mylist_anime_id_fkey";
						columns: ["mylist_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_mylist_anime_id_fkey";
						columns: ["mylist_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_mylist_anime_id_fkey";
						columns: ["mylist_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "notifications_mylist_anime_id_fkey";
						columns: ["mylist_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "notifications_recipient_id_fkey";
						columns: ["recipient_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			post_hashtags: {
				Row: {
					hashtag_id: number;
					post_id: string;
				};
				Insert: {
					hashtag_id: number;
					post_id: string;
				};
				Update: {
					hashtag_id?: number;
					post_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "post_hashtags_hashtag_id_fkey";
						columns: ["hashtag_id"];
						isOneToOne: false;
						referencedRelation: "hashtags";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "post_hashtags_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
				];
			};
			posts: {
				Row: {
					anime_id: number | null;
					broadcast_room_session_id: string | null;
					content: string;
					created_at: string;
					cw_anime_id: number | null;
					event_id: string | null;
					exchange_share: Json | null;
					hidden_by_admin: boolean;
					id: string;
					image_urls: string[];
					parent_id: string | null;
					quoted_post_id: string | null;
					user_id: string;
				};
				Insert: {
					anime_id?: number | null;
					broadcast_room_session_id?: string | null;
					content: string;
					created_at?: string;
					cw_anime_id?: number | null;
					event_id?: string | null;
					exchange_share?: Json | null;
					hidden_by_admin?: boolean;
					id?: string;
					image_urls?: string[];
					parent_id?: string | null;
					quoted_post_id?: string | null;
					user_id: string;
				};
				Update: {
					anime_id?: number | null;
					broadcast_room_session_id?: string | null;
					content?: string;
					created_at?: string;
					cw_anime_id?: number | null;
					event_id?: string | null;
					exchange_share?: Json | null;
					hidden_by_admin?: boolean;
					id?: string;
					image_urls?: string[];
					parent_id?: string | null;
					quoted_post_id?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_broadcast_room_session_id_fkey";
						columns: ["broadcast_room_session_id"];
						isOneToOne: false;
						referencedRelation: "broadcast_room_sessions";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_cw_anime_id_fkey";
						columns: ["cw_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_cw_anime_id_fkey";
						columns: ["cw_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_cw_anime_id_fkey";
						columns: ["cw_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_cw_anime_id_fkey";
						columns: ["cw_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "posts_cw_anime_id_fkey";
						columns: ["cw_anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_parent_id_fkey";
						columns: ["parent_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_quoted_post_id_fkey";
						columns: ["quoted_post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "posts_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			profiles: {
				Row: {
					avatar_url: string | null;
					bio: string | null;
					created_at: string;
					display_name: string | null;
					header_url: string | null;
					id: string;
					is_admin: boolean;
					is_private: boolean;
					list_is_public: boolean;
					setup_completed: boolean;
					username: string;
				};
				Insert: {
					avatar_url?: string | null;
					bio?: string | null;
					created_at?: string;
					display_name?: string | null;
					header_url?: string | null;
					id: string;
					is_admin?: boolean;
					is_private?: boolean;
					list_is_public?: boolean;
					setup_completed?: boolean;
					username: string;
				};
				Update: {
					avatar_url?: string | null;
					bio?: string | null;
					created_at?: string;
					display_name?: string | null;
					header_url?: string | null;
					id?: string;
					is_admin?: boolean;
					is_private?: boolean;
					list_is_public?: boolean;
					setup_completed?: boolean;
					username?: string;
				};
				Relationships: [];
			};
			reports: {
				Row: {
					created_at: string;
					details: string | null;
					id: string;
					reason: string;
					reporter_id: string;
					resolved_at: string | null;
					resolved_by: string | null;
					status: string;
					target_id: string;
					target_type: string;
					target_user_id: string | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					details?: string | null;
					id?: string;
					reason: string;
					reporter_id: string;
					resolved_at?: string | null;
					resolved_by?: string | null;
					status?: string;
					target_id: string;
					target_type: string;
					target_user_id?: string | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					details?: string | null;
					id?: string;
					reason?: string;
					reporter_id?: string;
					resolved_at?: string | null;
					resolved_by?: string | null;
					status?: string;
					target_id?: string;
					target_type?: string;
					target_user_id?: string | null;
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
						foreignKeyName: "reports_resolved_by_fkey";
						columns: ["resolved_by"];
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
				];
			};
			reposts: {
				Row: {
					created_at: string;
					post_id: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					post_id: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					post_id?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "reposts_post_id_fkey";
						columns: ["post_id"];
						isOneToOne: false;
						referencedRelation: "posts";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "reposts_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			room_exit_survey_responses: {
				Row: {
					anime_id: number | null;
					answers: Json;
					broadcast_room_session_id: string | null;
					comparison_with_x: string | null;
					event_id: string | null;
					experiment_run_id: string;
					good_points: string | null;
					id: string;
					improvement_points: string | null;
					next_participation: string | null;
					overall_rating: number | null;
					post_count: number;
					readability_rating: number | null;
					room_kind: string;
					shared_experience_rating: number | null;
					skipped: boolean;
					stayed_seconds: number;
					submitted_at: string;
					survey_version: string;
					user_id: string;
				};
				Insert: {
					anime_id?: number | null;
					answers?: Json;
					broadcast_room_session_id?: string | null;
					comparison_with_x?: string | null;
					event_id?: string | null;
					experiment_run_id: string;
					good_points?: string | null;
					id?: string;
					improvement_points?: string | null;
					next_participation?: string | null;
					overall_rating?: number | null;
					post_count?: number;
					readability_rating?: number | null;
					room_kind?: string;
					shared_experience_rating?: number | null;
					skipped?: boolean;
					stayed_seconds?: number;
					submitted_at?: string;
					survey_version?: string;
					user_id: string;
				};
				Update: {
					anime_id?: number | null;
					answers?: Json;
					broadcast_room_session_id?: string | null;
					comparison_with_x?: string | null;
					event_id?: string | null;
					experiment_run_id?: string;
					good_points?: string | null;
					id?: string;
					improvement_points?: string | null;
					next_participation?: string | null;
					overall_rating?: number | null;
					post_count?: number;
					readability_rating?: number | null;
					room_kind?: string;
					shared_experience_rating?: number | null;
					skipped?: boolean;
					stayed_seconds?: number;
					submitted_at?: string;
					survey_version?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "room_exit_survey_responses_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_broadcast_room_session_id_fkey";
						columns: ["broadcast_room_session_id"];
						isOneToOne: false;
						referencedRelation: "broadcast_room_sessions";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_experiment_run_id_fkey";
						columns: ["experiment_run_id"];
						isOneToOne: false;
						referencedRelation: "room_experiment_runs";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_exit_survey_responses_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			room_experiment_runs: {
				Row: {
					anime_id: number | null;
					created_at: string;
					created_by: string;
					ended_at: string | null;
					ended_by: string | null;
					event_id: string | null;
					id: string;
					label: string | null;
					notes: string | null;
					room_kind: string;
					started_at: string;
					updated_at: string;
				};
				Insert: {
					anime_id?: number | null;
					created_at?: string;
					created_by: string;
					ended_at?: string | null;
					ended_by?: string | null;
					event_id?: string | null;
					id?: string;
					label?: string | null;
					notes?: string | null;
					room_kind?: string;
					started_at?: string;
					updated_at?: string;
				};
				Update: {
					anime_id?: number | null;
					created_at?: string;
					created_by?: string;
					ended_at?: string | null;
					ended_by?: string | null;
					event_id?: string | null;
					id?: string;
					label?: string | null;
					notes?: string | null;
					room_kind?: string;
					started_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "room_experiment_runs_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_runs_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_runs_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_runs_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_runs_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_runs_created_by_fkey";
						columns: ["created_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_runs_ended_by_fkey";
						columns: ["ended_by"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_runs_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
				];
			};
			room_experiment_visits: {
				Row: {
					anime_id: number | null;
					broadcast_room_session_id: string | null;
					client_visit_key: string;
					created_at: string;
					entered_at: string;
					event_id: string | null;
					exited_at: string | null;
					heartbeat_count: number;
					id: string;
					last_seen_at: string;
					room_kind: string;
					run_id: string;
					updated_at: string;
					user_agent: string | null;
					user_id: string;
				};
				Insert: {
					anime_id?: number | null;
					broadcast_room_session_id?: string | null;
					client_visit_key: string;
					created_at?: string;
					entered_at?: string;
					event_id?: string | null;
					exited_at?: string | null;
					heartbeat_count?: number;
					id?: string;
					last_seen_at?: string;
					room_kind?: string;
					run_id: string;
					updated_at?: string;
					user_agent?: string | null;
					user_id: string;
				};
				Update: {
					anime_id?: number | null;
					broadcast_room_session_id?: string | null;
					client_visit_key?: string;
					created_at?: string;
					entered_at?: string;
					event_id?: string | null;
					exited_at?: string | null;
					heartbeat_count?: number;
					id?: string;
					last_seen_at?: string;
					room_kind?: string;
					run_id?: string;
					updated_at?: string;
					user_agent?: string | null;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "room_experiment_visits_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_visits_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_visits_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_visits_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "room_experiment_visits_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_visits_broadcast_room_session_id_fkey";
						columns: ["broadcast_room_session_id"];
						isOneToOne: false;
						referencedRelation: "broadcast_room_sessions";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_visits_event_id_fkey";
						columns: ["event_id"];
						isOneToOne: false;
						referencedRelation: "events";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_visits_run_id_fkey";
						columns: ["run_id"];
						isOneToOne: false;
						referencedRelation: "room_experiment_runs";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "room_experiment_visits_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
			studio_name_aliases: {
				Row: {
					alias: string;
					alias_key: string;
					imported_at: string;
					match_method: string;
					source: string;
					source_key: string;
				};
				Insert: {
					alias: string;
					alias_key: string;
					imported_at?: string;
					match_method: string;
					source: string;
					source_key: string;
				};
				Update: {
					alias?: string;
					alias_key?: string;
					imported_at?: string;
					match_method?: string;
					source?: string;
					source_key?: string;
				};
				Relationships: [
					{
						foreignKeyName: "studio_name_aliases_source_source_key_fkey";
						columns: ["source", "source_key"];
						isOneToOne: false;
						referencedRelation: "studio_source_records";
						referencedColumns: ["source", "source_key"];
					},
				];
			};
			studio_source_records: {
				Row: {
					aliases: Json;
					canonical_name_en: string;
					canonical_name_ja: string | null;
					canonical_name_source: string;
					imported_at: string;
					mal_company_id: number | null;
					name_en: string;
					name_ja: string | null;
					source: string;
					source_key: string;
					source_url: string;
					source_version: string;
				};
				Insert: {
					aliases?: Json;
					canonical_name_en: string;
					canonical_name_ja?: string | null;
					canonical_name_source: string;
					imported_at?: string;
					mal_company_id?: number | null;
					name_en: string;
					name_ja?: string | null;
					source: string;
					source_key: string;
					source_url: string;
					source_version: string;
				};
				Update: {
					aliases?: Json;
					canonical_name_en?: string;
					canonical_name_ja?: string | null;
					canonical_name_source?: string;
					imported_at?: string;
					mal_company_id?: number | null;
					name_en?: string;
					name_ja?: string | null;
					source?: string;
					source_key?: string;
					source_url?: string;
					source_version?: string;
				};
				Relationships: [];
			};
			syobocal_channels: {
				Row: {
					channel_group_id: number | null;
					channel_number: number | null;
					chid: number;
					epg_name: string | null;
					epg_url: string | null;
					imported_at: string;
					name: string;
					raw_data: Json;
					site_url: string | null;
					source_updated_at: string | null;
				};
				Insert: {
					channel_group_id?: number | null;
					channel_number?: number | null;
					chid: number;
					epg_name?: string | null;
					epg_url?: string | null;
					imported_at?: string;
					name: string;
					raw_data: Json;
					site_url?: string | null;
					source_updated_at?: string | null;
				};
				Update: {
					channel_group_id?: number | null;
					channel_number?: number | null;
					chid?: number;
					epg_name?: string | null;
					epg_url?: string | null;
					imported_at?: string;
					name?: string;
					raw_data?: Json;
					site_url?: string | null;
					source_updated_at?: string | null;
				};
				Relationships: [];
			};
			syobocal_programs: {
				Row: {
					chid: number;
					deleted: boolean;
					ends_at: string;
					episode_number: number | null;
					flags: number;
					imported_at: string;
					pid: number;
					program_comment: string | null;
					raw_data: Json;
					revision: number;
					source_updated_at: string | null;
					start_offset_seconds: number;
					starts_at: string;
					subtitle: string | null;
					tid: number;
					warning: boolean;
				};
				Insert: {
					chid: number;
					deleted?: boolean;
					ends_at: string;
					episode_number?: number | null;
					flags?: number;
					imported_at?: string;
					pid: number;
					program_comment?: string | null;
					raw_data: Json;
					revision?: number;
					source_updated_at?: string | null;
					start_offset_seconds?: number;
					starts_at: string;
					subtitle?: string | null;
					tid: number;
					warning?: boolean;
				};
				Update: {
					chid?: number;
					deleted?: boolean;
					ends_at?: string;
					episode_number?: number | null;
					flags?: number;
					imported_at?: string;
					pid?: number;
					program_comment?: string | null;
					raw_data?: Json;
					revision?: number;
					source_updated_at?: string | null;
					start_offset_seconds?: number;
					starts_at?: string;
					subtitle?: string | null;
					tid?: number;
					warning?: boolean;
				};
				Relationships: [
					{
						foreignKeyName: "syobocal_programs_chid_fkey";
						columns: ["chid"];
						isOneToOne: false;
						referencedRelation: "syobocal_channels";
						referencedColumns: ["chid"];
					},
					{
						foreignKeyName: "syobocal_programs_tid_fkey";
						columns: ["tid"];
						isOneToOne: false;
						referencedRelation: "syobocal_titles";
						referencedColumns: ["tid"];
					},
				];
			};
			syobocal_titles: {
				Row: {
					category: number | null;
					first_channel: string | null;
					first_month: number | null;
					first_year: number | null;
					imported_at: string;
					links: Json;
					official_site_url: string | null;
					official_x_url: string | null;
					raw_data: Json;
					short_title: string | null;
					source_updated_at: string | null;
					source_url: string;
					tid: number;
					title: string;
					title_yomi: string | null;
				};
				Insert: {
					category?: number | null;
					first_channel?: string | null;
					first_month?: number | null;
					first_year?: number | null;
					imported_at?: string;
					links?: Json;
					official_site_url?: string | null;
					official_x_url?: string | null;
					raw_data: Json;
					short_title?: string | null;
					source_updated_at?: string | null;
					source_url: string;
					tid: number;
					title: string;
					title_yomi?: string | null;
				};
				Update: {
					category?: number | null;
					first_channel?: string | null;
					first_month?: number | null;
					first_year?: number | null;
					imported_at?: string;
					links?: Json;
					official_site_url?: string | null;
					official_x_url?: string | null;
					raw_data?: Json;
					short_title?: string | null;
					source_updated_at?: string | null;
					source_url?: string;
					tid?: number;
					title?: string;
					title_yomi?: string | null;
				};
				Relationships: [];
			};
			user_anime_list: {
				Row: {
					anime_id: number;
					progress: number;
					score: number | null;
					status: string;
					updated_at: string;
					user_id: string;
				};
				Insert: {
					anime_id: number;
					progress?: number;
					score?: number | null;
					status: string;
					updated_at?: string;
					user_id: string;
				};
				Update: {
					anime_id?: number;
					progress?: number;
					score?: number | null;
					status?: string;
					updated_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_popularity";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_top_rated";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_trending";
						referencedColumns: ["anime_id"];
					},
					{
						foreignKeyName: "user_anime_list_anime_id_fkey";
						columns: ["anime_id"];
						isOneToOne: false;
						referencedRelation: "anime_with_computed_broadcast_status";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "user_anime_list_user_id_fkey";
						columns: ["user_id"];
						isOneToOne: false;
						referencedRelation: "profiles";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: {
			anime_popularity: {
				Row: {
					anime_id: number | null;
					list_count: number | null;
				};
				Relationships: [];
			};
			anime_top_rated: {
				Row: {
					anime_id: number | null;
					avg_score: number | null;
					score_count: number | null;
				};
				Relationships: [];
			};
			anime_trending: {
				Row: {
					anime_id: number | null;
					recent_count: number | null;
				};
				Relationships: [];
			};
			anime_with_computed_broadcast_status: {
				Row: {
					aired_from: string | null;
					aired_to: string | null;
					broadcast_day: number | null;
					broadcast_duration_minutes: number | null;
					broadcast_room_post_close_minutes: number | null;
					broadcast_room_pre_open_minutes: number | null;
					broadcast_station: string[] | null;
					broadcast_time: string | null;
					computed_broadcast_status: string | null;
					copyright: string | null;
					cover_source_url: string | null;
					cover_url: string | null;
					created_at: string | null;
					episode_count: string | null;
					genre: string[] | null;
					genre_en: string[] | null;
					hidden_by_admin: boolean | null;
					id: number | null;
					mal_id: number | null;
					metadata_ready: boolean | null;
					official_hashtag: string[] | null;
					official_site_url: string | null;
					official_x_url: string | null;
					producer: string[] | null;
					resources: Json | null;
					room_type: string | null;
					room_type_source: string | null;
					season: string | null;
					source: string | null;
					status: string | null;
					studio: string[] | null;
					studio_en: string[] | null;
					synopsis: string | null;
					title: string | null;
					title_en: string | null;
					title_romaji: string | null;
					title_yomi: string | null;
					type: string | null;
				};
				Insert: {
					aired_from?: string | null;
					aired_to?: string | null;
					broadcast_day?: number | null;
					broadcast_duration_minutes?: number | null;
					broadcast_room_post_close_minutes?: number | null;
					broadcast_room_pre_open_minutes?: number | null;
					broadcast_station?: string[] | null;
					broadcast_time?: string | null;
					computed_broadcast_status?: never;
					copyright?: string | null;
					cover_source_url?: string | null;
					cover_url?: string | null;
					created_at?: string | null;
					episode_count?: string | null;
					genre?: string[] | null;
					genre_en?: string[] | null;
					hidden_by_admin?: boolean | null;
					id?: number | null;
					mal_id?: number | null;
					metadata_ready?: boolean | null;
					official_hashtag?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					producer?: string[] | null;
					resources?: Json | null;
					room_type?: string | null;
					room_type_source?: string | null;
					season?: string | null;
					source?: string | null;
					status?: string | null;
					studio?: string[] | null;
					studio_en?: string[] | null;
					synopsis?: string | null;
					title?: string | null;
					title_en?: string | null;
					title_romaji?: string | null;
					title_yomi?: string | null;
					type?: string | null;
				};
				Update: {
					aired_from?: string | null;
					aired_to?: string | null;
					broadcast_day?: number | null;
					broadcast_duration_minutes?: number | null;
					broadcast_room_post_close_minutes?: number | null;
					broadcast_room_pre_open_minutes?: number | null;
					broadcast_station?: string[] | null;
					broadcast_time?: string | null;
					computed_broadcast_status?: never;
					copyright?: string | null;
					cover_source_url?: string | null;
					cover_url?: string | null;
					created_at?: string | null;
					episode_count?: string | null;
					genre?: string[] | null;
					genre_en?: string[] | null;
					hidden_by_admin?: boolean | null;
					id?: number | null;
					mal_id?: number | null;
					metadata_ready?: boolean | null;
					official_hashtag?: string[] | null;
					official_site_url?: string | null;
					official_x_url?: string | null;
					producer?: string[] | null;
					resources?: Json | null;
					room_type?: string | null;
					room_type_source?: string | null;
					season?: string | null;
					source?: string | null;
					status?: string | null;
					studio?: string[] | null;
					studio_en?: string[] | null;
					synopsis?: string | null;
					title?: string | null;
					title_en?: string | null;
					title_romaji?: string | null;
					title_yomi?: string | null;
					type?: string | null;
				};
				Relationships: [];
			};
		};
		Functions: {
			can_select_anime_exchange_entry: {
				Args: { entry_id: string };
				Returns: boolean;
			};
			can_view_profile_content: {
				Args: { profile_id: string };
				Returns: boolean;
			};
			cancel_anime_exchange: {
				Args: never;
				Returns: {
					cancelled: boolean;
					cancelled_count: number;
				}[];
			};
			check_invite_code: { Args: { p_code: string }; Returns: boolean };
			correct_broadcast_room_session_episode: {
				Args: {
					p_anomaly?: Json;
					p_episode_number: number;
					p_session_id: string;
				};
				Returns: boolean;
			};
			create_anime_exchange: {
				Args: {
					p_anime_id: number;
					p_comment?: string;
					p_subjective_tags?: string[];
				};
				Returns: {
					exchange_id: string;
					received_anime_id: number;
					received_entry_id: string;
				}[];
			};
			create_invite: {
				Args: { p_expires_at?: string; p_max_uses?: number };
				Returns: string;
			};
			dispatch_due_broadcast_notifications: { Args: never; Returns: undefined };
			enqueue_due_broadcast_notifications: {
				Args: { target_user_id?: string };
				Returns: undefined;
			};
			ensure_broadcast_room_session: {
				Args: { p_anime_id: number; p_room_date: string };
				Returns: {
					anime_id: number;
					created_at: string;
					duration_minutes: number;
					episode_number: number | null;
					episode_title: string | null;
					id: string;
					posting_closes_at: string;
					posting_opens_at: string;
					room_date: string;
					room_key: string;
					room_kind: string;
					schedule_correction_note: string | null;
					schedule_frozen_at: string | null;
					schedule_source: string | null;
					scheduled_at: string;
					source_channel_id: number | null;
					source_channel_name: string | null;
					source_program_id: number | null;
					source_snapshot: Json | null;
					source_title_id: number | null;
				}[];
				SetofOptions: {
					from: "*";
					to: "broadcast_room_sessions";
					isOneToOne: false;
					isSetofReturn: true;
				};
			};
			ensure_global_anime_lobby_session: {
				Args: { p_anime_id: number };
				Returns: {
					anime_id: number;
					created_at: string;
					duration_minutes: number;
					episode_number: number | null;
					episode_title: string | null;
					id: string;
					posting_closes_at: string;
					posting_opens_at: string;
					room_date: string;
					room_key: string;
					room_kind: string;
					schedule_correction_note: string | null;
					schedule_frozen_at: string | null;
					schedule_source: string | null;
					scheduled_at: string;
					source_channel_id: number | null;
					source_channel_name: string | null;
					source_program_id: number | null;
					source_snapshot: Json | null;
					source_title_id: number | null;
				}[];
				SetofOptions: {
					from: "*";
					to: "broadcast_room_sessions";
					isOneToOne: false;
					isSetofReturn: true;
				};
			};
			generate_due_broadcast_notifications: { Args: never; Returns: undefined };
			get_following_timeline: {
				Args: { p_before?: string; p_before_id?: string; p_limit?: number };
				Returns: {
					post_id: string;
					repost_user_id: string;
					reposted_at: string;
					timeline_created_at: string;
				}[];
			};
			get_post_counts: {
				Args: { p_post_ids: string[]; p_user_id?: string };
				Returns: {
					bookmarked_by_me: boolean;
					like_count: number;
					liked_by_me: boolean;
					post_id: string;
					reply_count: number;
					repost_count: number;
					reposted_by_me: boolean;
				}[];
			};
			get_post_reaction_users: {
				Args: {
					action_type: string;
					p_limit?: number;
					p_offset?: number;
					target_post_id: string;
				};
				Returns: {
					avatar_url: string;
					display_name: string;
					reacted_at: string;
					user_id: string;
					username: string;
				}[];
			};
			get_trending_hashtags: {
				Args: { limit_count?: number };
				Returns: {
					name: string;
					post_count: number;
				}[];
			};
			has_beta_write_access: { Args: never; Returns: boolean };
			is_current_user_admin: { Args: never; Returns: boolean };
			is_profile_active_for_writes: {
				Args: { profile_id: string };
				Returns: boolean;
			};
			redeem_invite: { Args: { p_code: string }; Returns: undefined };
			revoke_invite: { Args: { p_invite_id: string }; Returns: undefined };
			show_limit: { Args: never; Returns: number };
			show_trgm: { Args: { "": string }; Returns: string[] };
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {},
	},
} as const;
