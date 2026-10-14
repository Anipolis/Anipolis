const POST_BASE_FIELDS = [
	"id",
	"content",
	"created_at",
	"user_id",
	"parent_id",
	"quoted_post_id",
	"image_urls",
	"anime_id",
	"event_id",
	"broadcast_room_session_id",
	// 話数ルーム（153）。放送時間外の投稿は放送枠を持たず、こちらだけを持つ
	"episode_room_id",
	// ネタバレ CW。作品の JOIN が取れなくても ID が残れば折り畳めるよう、基本列にも入れる（#317）
	"cw_anime_id",
];

export const POST_AUTHOR_SELECT = "profiles!posts_user_id_fkey ( username, display_name, avatar_url )";
export const POST_HASHTAGS_SELECT = "post_hashtags ( hashtags ( name ) )";
export const POST_ROOM_SESSION_SELECT =
	"broadcast_room_session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( room_date, room_kind, room_key )";
export const POST_EPISODE_ROOM_SELECT =
	"episode_room:episode_rooms!posts_episode_room_id_fkey ( kind, episode_number, special_key, label )";
export const POST_EVENT_SELECT = "event:events!posts_event_id_fkey ( id, title, hashtag )";
export const POST_CARD_ANIME_SELECT =
	"anime:anime!posts_anime_id_fkey ( id, title, cover_url, official_hashtag, broadcast_day, broadcast_time, broadcast_duration_minutes, aired_from )";
export const POST_CW_ANIME_SELECT = "cw_anime:anime!posts_cw_anime_id_fkey ( id, title, cover_url )";

/**
 * 投稿カード用の SELECT。CW（ネタバレ注意）の列と作品は常に含める。
 * CW を外した取得を用意すると、取得経路やフォールバックによってネタバレ本文がそのまま出るため（#317）。
 */
export function buildPostCardSelect({ exchangeShare = true }: { exchangeShare?: boolean } = {}): string {
	return [
		...POST_BASE_FIELDS,
		exchangeShare ? "exchange_share" : null,
		POST_AUTHOR_SELECT,
		POST_HASHTAGS_SELECT,
		POST_ROOM_SESSION_SELECT,
		POST_EPISODE_ROOM_SELECT,
		POST_EVENT_SELECT,
		POST_CARD_ANIME_SELECT,
		POST_CW_ANIME_SELECT,
	]
		.filter((part): part is string => part !== null)
		.join(",\n");
}
