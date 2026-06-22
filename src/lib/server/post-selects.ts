const POST_BASE_FIELDS = [
	"id",
	"content",
	"created_at",
	"user_id",
	"parent_id",
	"quoted_post_id",
	"image_urls",
	"anime_id",
	"broadcast_room_session_id",
];

export const POST_AUTHOR_SELECT = "profiles!posts_user_id_fkey ( username, display_name, avatar_url )";
export const POST_HASHTAGS_SELECT = "post_hashtags ( hashtags ( name ) )";
export const POST_ROOM_SESSION_SELECT =
	"broadcast_room_session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( room_date, room_kind, room_key )";
export const POST_CARD_ANIME_SELECT =
	"anime:anime!posts_anime_id_fkey ( id, title, cover_url, official_hashtag, broadcast_day, broadcast_time, broadcast_duration_minutes, aired_from )";
export const POST_CW_ANIME_SELECT = "cw_anime:anime!posts_cw_anime_id_fkey ( id, title, cover_url )";

export function buildPostCardSelect({
	exchangeShare = true,
	cwAnime = false,
}: {
	exchangeShare?: boolean;
	cwAnime?: boolean;
} = {}): string {
	return [
		...POST_BASE_FIELDS,
		exchangeShare ? "exchange_share" : null,
		POST_AUTHOR_SELECT,
		POST_HASHTAGS_SELECT,
		POST_ROOM_SESSION_SELECT,
		POST_CARD_ANIME_SELECT,
		cwAnime ? POST_CW_ANIME_SELECT : null,
	]
		.filter((part): part is string => part !== null)
		.join(",\n");
}
