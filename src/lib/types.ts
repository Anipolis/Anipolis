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
	room_href: string | null;
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
}

type AnimeExchangeShareRaw = {
	type?: unknown;
	offered_anime?: unknown;
	received_anime?: unknown;
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
}

export interface TrendingHashtag {
	name: string;
	post_count: number;
}

export interface Notification {
	id: string;
	type: "like" | "repost" | "reply" | "mention" | "follow" | "follow_request" | "anime_recommendation";
	post_id: string | null;
	anime_recommendation_id: string | null;
	read: boolean;
	created_at: string;
	actor_username: string;
	actor_display_name: string | null;
	actor_avatar_url: string | null;
	post_content: string;
	recommendation_anime_id: string | null;
	recommendation_anime_title: string | null;
	recommendation_anime_cover_url: string | null;
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
	broadcast_station: string[] | null;
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
	exchange_share?: unknown;
	anime?: {
		id: string | number;
		title: string;
		cover_url: string | null;
		broadcast_day?: number | null;
		broadcast_time?: string | null;
	} | null;
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
					room_href: buildAnimeRoomHref(raw.anime, raw.created_at),
					user_score: null,
				}
			: null,
		exchange_share: toAnimeExchangeShare(raw.exchange_share),
	};
}

function buildAnimeRoomHref(anime: NonNullable<RawPost["anime"]>, createdAt: string): string | null {
	if (anime.broadcast_day == null) return null;
	const roomDate = getRoomDateKeyForPost(createdAt, anime.broadcast_day);
	if (!roomDate) return null;
	if (!isWithinBroadcastWindow(createdAt, roomDate, anime.broadcast_time ?? null)) return null;
	return `/rooms/anime/${String(anime.id)}/${roomDate}`;
}

function isWithinBroadcastWindow(createdAt: string, roomDate: string, broadcastTime: string | null): boolean {
	if (!broadcastTime) return false;
	const match = broadcastTime.match(/^(\d{1,2}):([0-5]\d)/);
	if (!match) return false;
	const [year, month, day] = roomDate.split("-").map(Number);
	if (year == null || month == null || day == null) return false;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	// hour≥24（深夜帯: "25:30"など）でも Date.UTC の算術オーバーフローで正しく翌日に繰り越される
	const scheduledMs = Date.UTC(year, month - 1, day, hour - 9, minute);
	const createdMs = new Date(createdAt).getTime();
	if (Number.isNaN(createdMs)) return false;
	return createdMs >= scheduledMs && createdMs <= scheduledMs + 30 * 60 * 1000;
}

function getRoomDateKeyForPost(createdAt: string, broadcastDay: number): string | null {
	const createdDate = new Date(createdAt);
	if (Number.isNaN(createdDate.getTime())) return null;

	const jstDate = new Date(createdDate.getTime() + 9 * 60 * 60 * 1000);
	const dayOffset = (jstDate.getUTCDay() - broadcastDay + 7) % 7;
	jstDate.setUTCDate(jstDate.getUTCDate() - dayOffset);

	const year = jstDate.getUTCFullYear();
	const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
	const day = String(jstDate.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
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
