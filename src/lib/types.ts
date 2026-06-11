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
	is_private: boolean;
	is_admin?: boolean;
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
		episode_count: string | null;
	};
}

export interface AnimeQuote {
	id: string;
	title: string;
	cover_url: string | null;
	official_hashtag: string[] | null;
	room_href: string | null;
	episode_number: number | null;
	/** 閲覧者自身のスコア（enrichPostsWithCounts で付加） */
	user_score: number | null;
}

export interface AnimeExchangeShareAnime {
	id: string;
	title: string;
	title_en: string | null;
	cover_url: string | null;
}

export interface AnimeExchangeShare {
	type: "anime_exchange";
	offered_anime: AnimeExchangeShareAnime;
	received_anime: AnimeExchangeShareAnime;
	offered_comment: string | null;
	received_comment: string | null;
}

type AnimeExchangeShareRaw = {
	type?: unknown;
	offered_anime?: unknown;
	received_anime?: unknown;
	offered_comment?: unknown;
	received_comment?: unknown;
};

type AnimeExchangeShareAnimeRaw = {
	id?: unknown;
	title?: unknown;
	title_en?: unknown;
	cover_url?: unknown;
};

export interface QuotedPost {
	id: string;
	content: string;
	user_id: string;
	created_at: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
}

export interface Post {
	id: string;
	user_id: string;
	parent_id: string | null;
	quoted_post_id: string | null;
	quoted_post: QuotedPost | null;
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
	bookmarked_by_me: boolean;
	anime_id: string | null;
	anime_quote: AnimeQuote | null;
	exchange_share: AnimeExchangeShare | null;
	cw_anime_id: string | null;
	cw_anime: { id: string; title: string; cover_url: string | null } | null;
}

export type ReactionType = "like" | "repost";

export interface ReactionUser {
	user_id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
	reacted_at: string;
}

export interface TrendingHashtag {
	name: string;
	post_count: number;
}

export interface Notification {
	id: string;
	type: "like" | "repost" | "reply" | "mention" | "follow" | "follow_request" | "anime_recommendation" | "broadcast";
	post_id: string | null;
	anime_recommendation_id: string | null;
	broadcast_anime_id: string | null;
	broadcast_scheduled_at: string | null;
	broadcast_room_date: string | null;
	read: boolean;
	created_at: string;
	actor_username: string;
	actor_display_name: string | null;
	actor_avatar_url: string | null;
	post_content: string;
	recommendation_anime_id: string | null;
	recommendation_anime_title: string | null;
	recommendation_anime_cover_url: string | null;
	broadcast_anime_title: string | null;
	broadcast_anime_cover_url: string | null;
}

export interface Event {
	id: string;
	creator_id: string;
	title: string;
	description: string | null;
	hashtag: string; // # なし (例: "AnimeOP2026")
	scheduled_at: string; // ISO 8601
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

export type AnimeStatus = "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold";
export type BroadcastStatus = "airing" | "finished" | "upcoming" | "unknown";

export interface UserAnimeEntry {
	status: AnimeStatus;
	score: number | null;
	progress: number;
	updated_at: string;
}

export interface AnimeResourceLink {
	name: string;
	url: string;
}

export interface AnimeRelation {
	relation_type: string;
	related_anime_mal_id: number;
	related_title: string;
	anime: {
		id: string;
		title: string;
		cover_url: string | null;
	} | null;
}

export interface Anime {
	id: string;
	mal_id: number | null;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	synopsis: string | null;
	cover_url: string | null;
	season: string | null;
	episode_count: string | null;
	type: string | null;
	status: string | null;
	computed_broadcast_status: BroadcastStatus;
	aired_from: string | null;
	aired_to: string | null;
	source: string | null;
	studio: string[] | null;
	studio_en: string[] | null;
	producer: string[] | null;
	genre: string[] | null;
	genre_en: string[] | null;
	official_site_url: string | null;
	official_x_url: string | null;
	official_hashtag: string[] | null;
	resources: AnimeResourceLink[];
	copyright: string | null;
	broadcast_day: number | null;
	broadcast_time: string | null;
	broadcast_duration_minutes: number;
	broadcast_room_pre_open_minutes: number;
	broadcast_room_post_close_minutes: number;
	broadcast_station: string[] | null;
	hidden_by_admin: boolean;
	created_at: string;
	// 集計フィールド（クエリ時に付加）
	list_count?: number;
	recent_count?: number;
	avg_score?: number | null;
	score_count?: number;
	// ログインユーザーのマイリスト状態
	user_entry?: UserAnimeEntry | null;
}

export interface AnimeExchangeItem {
	id: string;
	status: "waiting" | "matched" | "cancelled";
	created_at: string;
	matched_at: string | null;
	comment: string | null;
	offered_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
	};
	received_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
	} | null;
	received_comment: string | null;
}

// ----------------------------------------------------------------
// Supabase のネストクエリ結果の共通 raw 形 (POSTS_SELECT に対応)
export interface RawPost {
	id: string;
	user_id: string;
	parent_id?: string | null;
	quoted_post_id?: string | null;
	content: string;
	created_at: string;
	image_urls?: string[] | null;
	anime_id?: string | number | null;
	broadcast_room_session_id?: string | null;
	broadcast_room_session?: { room_date: string } | { room_date: string }[] | null;
	exchange_share?: unknown;
	anime?: {
		id: string | number;
		title: string;
		cover_url: string | null;
		official_hashtag?: string[] | null;
		broadcast_day?: number | null;
		broadcast_time?: string | null;
		broadcast_duration_minutes?: number | null;
		aired_from?: string | null;
	} | null;
	cw_anime_id?: string | number | null;
	cw_anime?: { id: string | number; title: string; cover_url: string | null } | null;
	profiles: {
		username: string;
		display_name: string | null;
		avatar_url: string | null;
	} | null;
	post_hashtags: {
		hashtags: { name: string } | null;
	}[];
	quoted_post?:
		| {
				id: string;
				content: string;
				user_id: string;
				created_at: string;
				profiles: {
					username: string;
					display_name: string | null;
					avatar_url: string | null;
				} | null;
		  }[]
		| null;
}

// Supabase のネストクエリ結果を Post に変換するユーティリティ
export function toPost(
	raw: RawPost,
	counts?: {
		like_count?: number;
		repost_count?: number;
		reply_count?: number;
		liked_by_me?: boolean;
		reposted_by_me?: boolean;
		bookmarked_by_me?: boolean;
	},
): Post {
	return {
		id: raw.id,
		user_id: raw.user_id,
		parent_id: raw.parent_id ?? null,
		quoted_post_id: raw.quoted_post_id ?? null,
		quoted_post: (() => {
			const qp = Array.isArray(raw.quoted_post) ? raw.quoted_post[0] : raw.quoted_post;
			if (!qp) return null;
			return {
				id: qp.id,
				content: qp.content,
				user_id: qp.user_id,
				created_at: qp.created_at,
				username: qp.profiles?.username ?? "unknown",
				display_name: qp.profiles?.display_name ?? null,
				avatar_url: qp.profiles?.avatar_url ?? null,
			};
		})(),
		content: raw.content,
		created_at: raw.created_at,
		image_urls: raw.image_urls ?? [],
		username: raw.profiles?.username ?? "unknown",
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
		bookmarked_by_me: counts?.bookmarked_by_me ?? false,
		anime_id: raw.anime_id != null ? String(raw.anime_id) : null,
		anime_quote: raw.anime
			? {
					id: String(raw.anime.id),
					title: raw.anime.title,
					cover_url: raw.anime.cover_url,
					official_hashtag: raw.anime.official_hashtag ?? null,
					room_href: buildAnimeRoomHref(raw.anime, raw.broadcast_room_session ?? null),
					episode_number: calcEpisodeNumber(
						raw.broadcast_room_session ?? null,
						raw.anime.aired_from ?? null,
						raw.anime.broadcast_time ?? null,
					),
					user_score: null,
				}
			: null,
		exchange_share: toAnimeExchangeShare(raw.exchange_share),
		cw_anime_id: raw.cw_anime_id != null ? String(raw.cw_anime_id) : null,
		cw_anime: raw.cw_anime
			? { id: String(raw.cw_anime.id), title: raw.cw_anime.title, cover_url: raw.cw_anime.cover_url ?? null }
			: null,
	};
}

function buildAnimeRoomHref(
	anime: NonNullable<RawPost["anime"]>,
	rawSession: RawPost["broadcast_room_session"],
): string | null {
	const session = Array.isArray(rawSession) ? rawSession[0] : rawSession;
	return session?.room_date ? `/rooms/anime/${String(anime.id)}/${session.room_date}` : null;
}

function calcEpisodeNumber(
	rawSession: RawPost["broadcast_room_session"],
	airedFrom: string | null,
	broadcastTime: string | null,
): number | null {
	const session = Array.isArray(rawSession) ? rawSession[0] : rawSession;
	if (!session?.room_date || !airedFrom) return null;
	const airedFromDate = new Date(`${airedFrom.slice(0, 10)}T00:00:00`);
	const slotDate = new Date(`${session.room_date}T00:00:00`);
	const broadcastHour = broadcastTime ? Number(broadcastTime.split(":")[0]) : 0;
	if (broadcastHour >= 24) slotDate.setDate(slotDate.getDate() + 1);
	const msDiff = slotDate.getTime() - airedFromDate.getTime();
	if (msDiff < 0) return null;
	return Math.floor(Math.round(msDiff / 86_400_000) / 7) + 1;
}

export function buildAnimeRoomLabel(anime: Pick<AnimeQuote, "title" | "official_hashtag" | "episode_number">): string {
	const officialHashtag = anime.official_hashtag
		?.map((tag) => tag.trim().replace(/^#+/, ""))
		.find((tag) => tag.length > 0);
	const fallbackHashtag = anime.title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
	const tag = `#${officialHashtag ?? fallbackHashtag}`;
	return anime.episode_number != null ? `${tag}　${anime.episode_number}話` : tag;
}

function toAnimeExchangeShare(value: unknown): AnimeExchangeShare | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as AnimeExchangeShareRaw;
	if (raw.type !== "anime_exchange") return null;
	const offered = toAnimeExchangeShareAnime(raw.offered_anime);
	const received = toAnimeExchangeShareAnime(raw.received_anime);
	if (!offered || !received) return null;
	return {
		type: "anime_exchange",
		offered_anime: offered,
		received_anime: received,
		offered_comment: typeof raw.offered_comment === "string" ? raw.offered_comment : null,
		received_comment: typeof raw.received_comment === "string" ? raw.received_comment : null,
	};
}

function toAnimeExchangeShareAnime(value: unknown): AnimeExchangeShareAnime | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as AnimeExchangeShareAnimeRaw;
	if (raw.id == null || typeof raw.title !== "string") return null;
	return {
		id: String(raw.id),
		title: raw.title,
		title_en: typeof raw.title_en === "string" ? raw.title_en : null,
		cover_url: typeof raw.cover_url === "string" ? raw.cover_url : null,
	};
}

export interface BroadcastNotificationSettings {
	notify_1min: boolean;
	notify_5min: boolean;
	notify_30min: boolean;
}

export type BroadcastRoomMuteDuration = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "event_end";

export interface BroadcastRoomMute {
	anime_id: string;
	anime_title: string;
	anime_cover_url: string | null;
	room_session_id: string;
	room_date: string;
	duration: BroadcastRoomMuteDuration;
	repeat_weekly: boolean;
	muted_until: string;
	created_at: string;
	updated_at: string;
}

export interface BroadcastRoomSession {
	id: string;
	anime_id: number;
	room_date: string;
	scheduled_at: string;
	duration_minutes: number;
	posting_opens_at: string;
	posting_closes_at: string;
}

export interface StoredAccount {
	userId: string;
	refreshToken: string;
	profile: {
		username: string;
		display_name: string | null;
		avatar_url: string | null;
	};
}
