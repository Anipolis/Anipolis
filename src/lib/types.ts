// ================================================================
// アプリ共通型定義
// ================================================================

import { toValidExchangeSubjectiveTags } from "$lib/exchange-tags";

export type AnimeSeasonChip = "" | "冬" | "春" | "夏" | "秋";
export type ActiveAnimeSeasonChip = Exclude<AnimeSeasonChip, "">;

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
	/** 話数ルーム（153）の投稿か。true なら episode_number はルームの話数 */
	episode_room?: boolean;
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
	offered_subjective_tags: string[];
	received_subjective_tags: string[];
}

type AnimeExchangeShareRaw = {
	type?: unknown;
	offered_anime?: unknown;
	received_anime?: unknown;
	offered_comment?: unknown;
	received_comment?: unknown;
	offered_subjective_tags?: unknown;
	received_subjective_tags?: unknown;
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
	/** 引用元の CW。引用枠では本文の代わりに警告を出す（#319） */
	cw_anime_id: string | null;
	cw_anime: { title: string } | null;
}

export interface RepostContext {
	user_id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
	created_at: string;
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
	broadcast_room_session_id: string | null;
	/** 話数ルーム（153）。放送時間外の話数ルームへの投稿は broadcast_room_session_id を持たない */
	episode_room_id: string | null;
	anime_quote: AnimeQuote | null;
	event_room: { id: string; title: string; hashtag: string } | null;
	exchange_share: AnimeExchangeShare | null;
	cw_anime_id: string | null;
	cw_anime: { id: string; title: string; cover_url: string | null } | null;
	repost_context: RepostContext | null;
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
	type:
		| "like"
		| "repost"
		| "reply"
		| "mention"
		| "follow"
		| "follow_request"
		| "anime_recommendation"
		| "broadcast"
		| "mylist_status"
		| "exchange_matched";
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
	/** 投稿行を取得できたか。削除済み・非表示の投稿は false（post_id は残る） */
	post_available: boolean;
	/** 本文なし投稿の文脈表示用: 添付画像数・作品引用・引用リポスト・トレード結果の有無 */
	post_image_count: number;
	post_has_anime_quote: boolean;
	post_has_quoted_post: boolean;
	post_has_exchange_share: boolean;
	/** 投稿の CW。プレビューでは本文の代わりに警告ラベルを出す（#319） */
	post_cw_anime_id: string | null;
	post_cw_anime_title: string | null;
	recommendation_anime_id: string | null;
	recommendation_anime_title: string | null;
	recommendation_anime_cover_url: string | null;
	broadcast_anime_title: string | null;
	broadcast_anime_cover_url: string | null;
	event_id: string | null;
	event_title: string | null;
	mylist_anime_id: string | null;
	mylist_status: AnimeStatus | null;
	mylist_anime_title: string | null;
	mylist_anime_cover_url: string | null;
	exchange_anime_id: string | null;
	exchange_anime_title: string | null;
	exchange_anime_cover_url: string | null;
}

export interface Event {
	id: string;
	creator_id: string;
	anime_id: string | null;
	title: string;
	description: string | null;
	hashtag: string; // # なし (例: "AnimeOP2026")
	scheduled_at: string; // ISO 8601
	duration_minutes: number | null;
	is_cancelled: boolean;
	created_at: string;
	// JOIN で付加されるフィールド（任意）
	creator_username?: string;
	anime?: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
	} | null;
	creator_display_name?: string | null;
	creator_avatar_url?: string | null;
}

// ----------------------------------------------------------------
// アニメDB
// ----------------------------------------------------------------

export type AnimeStatus = "watching" | "completed" | "plan_to_watch" | "dropped" | "on_hold";
export type AnimeRoomType = "episode" | "global";
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

export type AnimeDataAttributionSource =
	| "anime_offline_database"
	| "jikan"
	| "mal"
	| "wikidata"
	| "syobocal"
	| "annict";

export interface AnimeDataAttribution {
	anime_mal_id: number;
	source: AnimeDataAttributionSource;
	label: string;
	source_url: string;
	license_label: string | null;
	license_url: string | null;
}

export interface AnimeRelation {
	relation_type: string;
	related_anime_mal_id: number;
	related_title: string;
	anime: {
		id: string;
		title: string;
		cover_url: string | null;
	};
}

export interface Anime {
	id: string;
	mal_id: number | null;
	title: string;
	title_en: string | null;
	title_romaji: string | null;
	synopsis: string | null;
	cover_url: string | null;
	/** 画像の実体。cover_url は © がある作品だけ値が入る表示用の列（migration 136） */
	cover_source_url: string | null;
	season: string | null;
	episode_count: string | null;
	/** 整数の話数（152。episode_count から同期）。話数が数字でない・不明なら null */
	episode_total: number | null;
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
	room_type: AnimeRoomType;
	hidden_by_admin: boolean;
	metadata_ready: boolean;
	created_at: string;
	// 集計フィールド（クエリ時に付加）
	list_count?: number;
	recent_count?: number;
	avg_score?: number | null;
	score_count?: number;
	// ログインユーザーのマイリスト状態
	user_entry?: UserAnimeEntry | null;
}

/**
 * /anime 一覧ページのカード描画に必要な最小フィールドのみを持つ軽量型。
 * 一覧は最大1000件を HTML にシリアライズするため、Anime 全フィールド（約32個）を
 * そのまま埋め込むとペイロードが肥大化する。テンプレートが実際に参照する8フィールドへ
 * 射影してから返すことでページ重量を削減する。
 */
export type AnimeListItem = Pick<
	Anime,
	| "id"
	| "title"
	| "title_en"
	| "cover_url"
	| "season"
	| "episode_count"
	| "type"
	| "broadcast_day"
	| "computed_broadcast_status"
	| "user_entry"
	| "avg_score"
	| "score_count"
>;

export interface AnimeExchangeItem {
	id: string;
	status: "waiting" | "matched" | "cancelled";
	created_at: string;
	matched_at: string | null;
	comment: string | null;
	subjective_tags: string[];
	offered_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
		episode_count?: string | null;
		user_entry?: UserAnimeEntry | null;
	};
	received_anime: {
		id: string;
		title: string;
		title_en: string | null;
		cover_url: string | null;
		episode_count?: string | null;
		user_entry?: UserAnimeEntry | null;
	} | null;
	received_comment: string | null;
	received_subjective_tags: string[];
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
	event_id?: string | null;
	broadcast_room_session_id?: string | null;
	episode_room_id?: string | null;
	episode_room?:
		| {
				kind: string;
				episode_number: number | null;
				special_key: string | null;
				label: string | null;
				merged_into?: string | null;
		  }
		| {
				kind: string;
				episode_number: number | null;
				special_key: string | null;
				label: string | null;
				merged_into?: string | null;
		  }[]
		| null;
	broadcast_room_session?:
		| { room_date: string; room_kind?: "episode" | "global" | null; room_key?: string | null }
		| { room_date: string; room_kind?: "episode" | "global" | null; room_key?: string | null }[]
		| null;
	event?: { id: string; title: string; hashtag: string } | { id: string; title: string; hashtag: string }[] | null;
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
	repost_context?: RepostContext | null;
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
				cw_anime_id?: string | number | null;
				cw_anime?: { title: string } | { title: string }[] | null;
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
				cw_anime_id: qp.cw_anime_id != null ? String(qp.cw_anime_id) : null,
				cw_anime: (Array.isArray(qp.cw_anime) ? qp.cw_anime[0] : qp.cw_anime) ?? null,
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
		broadcast_room_session_id: raw.broadcast_room_session_id ?? null,
		episode_room_id: raw.episode_room_id ?? null,
		anime_quote: raw.anime
			? (() => {
					const anime = raw.anime;
					// 話数ルームの投稿は、ルームの話数とリンクをそのまま使う（放送日からの推定より正確）
					const episodeRoom = Array.isArray(raw.episode_room) ? raw.episode_room[0] : raw.episode_room;
					// 統合済みのルーム（merged_into あり）の話数は使わない。統合で投稿は統合先へ移るので通常は残らないが、
					// 残っていた場合に「第N話」の表示と遷移先（統合先へ転送）が食い違わないように（#394 Codex）
					const episodeNumber =
						episodeRoom?.kind === "episode" && !episodeRoom.merged_into
							? (episodeRoom.episode_number ?? null)
							: null;
					return {
						id: String(anime.id),
						title: anime.title,
						cover_url: anime.cover_url,
						official_hashtag: anime.official_hashtag ?? null,
						room_href:
							episodeNumber != null
								? `/rooms/anime/${String(anime.id)}/ep/${episodeNumber}`
								: buildAnimeRoomHref(anime, raw.broadcast_room_session ?? null),
						episode_number:
							episodeNumber ??
							calcEpisodeNumber(
								raw.broadcast_room_session ?? null,
								anime.aired_from ?? null,
								anime.broadcast_time ?? null,
							),
						episode_room: episodeNumber != null,
						user_score: null,
					};
				})()
			: null,
		event_room: (() => {
			const event = Array.isArray(raw.event) ? raw.event[0] : raw.event;
			return event ? { id: event.id, title: event.title, hashtag: event.hashtag } : null;
		})(),
		exchange_share: toAnimeExchangeShare(raw.exchange_share),
		cw_anime_id: raw.cw_anime_id != null ? String(raw.cw_anime_id) : null,
		cw_anime: raw.cw_anime
			? { id: String(raw.cw_anime.id), title: raw.cw_anime.title, cover_url: raw.cw_anime.cover_url ?? null }
			: null,
		repost_context: raw.repost_context ?? null,
	};
}

function buildAnimeRoomHref(
	anime: NonNullable<RawPost["anime"]>,
	rawSession: RawPost["broadcast_room_session"],
): string | null {
	const session = Array.isArray(rawSession) ? rawSession[0] : rawSession;
	if (session?.room_kind === "global") return `/rooms/anime/${String(anime.id)}/lobby`;
	return session?.room_date ? `/rooms/anime/${String(anime.id)}/${session.room_date}` : null;
}

export function calcEpisodeNumberFromDate(
	roomDate: string | null,
	airedFrom: string | null,
	broadcastTime: string | null,
): number | null {
	if (!roomDate || !airedFrom) return null;
	const airedFromDate = new Date(`${airedFrom.slice(0, 10)}T00:00:00`);
	const slotDate = new Date(`${roomDate}T00:00:00`);
	const broadcastHour = broadcastTime ? Number(broadcastTime.split(":")[0]) : 0;
	if (broadcastHour >= 24) slotDate.setDate(slotDate.getDate() + 1);
	const msDiff = slotDate.getTime() - airedFromDate.getTime();
	if (msDiff < 0) return null;
	return Math.floor(Math.round(msDiff / 86_400_000) / 7) + 1;
}

function calcEpisodeNumber(
	rawSession: RawPost["broadcast_room_session"],
	airedFrom: string | null,
	broadcastTime: string | null,
): number | null {
	const session = Array.isArray(rawSession) ? rawSession[0] : rawSession;
	if (session?.room_kind === "global") return null;
	return calcEpisodeNumberFromDate(session?.room_date ?? null, airedFrom, broadcastTime);
}

/** イベントルームリンクチップの表示ラベル。設定された「ルームリンク」(タグ)をタグ表記で返す */
export function buildEventRoomLabel(eventRoom: { title: string; hashtag: string }): string {
	const tag = eventRoom.hashtag.trim().replace(/^#+/, "");
	return tag.length > 0 ? `#${tag}` : eventRoom.title;
}

export function buildAnimeRoomLabel(
	anime: Pick<AnimeQuote, "title" | "official_hashtag" | "episode_number" | "episode_room">,
): string {
	// 話数ルームの投稿は「作品名 第N話」
	if (anime.episode_room && anime.episode_number != null) return `${anime.title} 第${anime.episode_number}話`;
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
		offered_subjective_tags: toValidExchangeSubjectiveTags(
			Array.isArray(raw.offered_subjective_tags) ? raw.offered_subjective_tags : [],
		),
		received_subjective_tags: toValidExchangeSubjectiveTags(
			Array.isArray(raw.received_subjective_tags) ? raw.received_subjective_tags : [],
		),
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

export type AnimeMuteType = "period" | "always";

export interface AnimeMute {
	id: string;
	anime_id: string;
	anime_title: string;
	anime_cover_url: string | null;
	mute_type: AnimeMuteType;
	period_days: number | null;
	is_repeat: boolean;
	muted_until: string | null;
	created_at: string;
}

// イベントは再放送がないため、ミュートは常に one-shot（そのイベントの投稿を恒久的に非表示にする）
export interface EventMute {
	id: string;
	event_id: string;
	created_at: string;
	// JOIN で付加される表示用フィールド
	event_title: string;
	event_scheduled_at: string;
	event_is_cancelled: boolean;
}

export interface BroadcastRoomSession {
	id: string;
	anime_id: number;
	room_date: string;
	room_kind: "episode" | "global";
	room_key: string;
	scheduled_at: string;
	duration_minutes: number;
	posting_opens_at: string;
	posting_closes_at: string;
	/** しょぼい番組表由来の話数・サブタイトル（同期セッションのみ） */
	episode_number?: number | null;
	episode_title?: string | null;
	/** この放送枠が属する話数ルーム（153） */
	episode_room_id?: string | null;
}

/** 話数ルーム（153）。作品×話数、または作品×特番キー */
export interface EpisodeRoom {
	id: string;
	anime_id: number;
	kind: "episode" | "special";
	episode_number: number | null;
	special_key: string | null;
	label: string | null;
	/** 投稿を受け付け始める時刻。NULL はまだ決まっていない（未放送） */
	opens_at: string | null;
	merged_into: string | null;
}

/** 話数ルームの中の放送枠（broadcast_room_sessions の行）。ルームの見出しと「ライブ開始地点へ」に使う */
export interface RoomAiring {
	id: string;
	scheduled_at: string;
	/** 放送の終わり（scheduled_at + 尺）。「放送中」の判定に使う（投稿受付はこの後も続く） */
	ends_at: string;
	posting_opens_at: string;
	posting_closes_at: string;
	airing_kind: "first" | "rerun" | "event";
	channel_name: string | null;
}

export interface OpenBroadcastRoomSummary {
	id: string;
	anime_id: string;
	room_date: string;
	room_kind: "episode" | "global";
	room_key: string;
	scheduled_at: string;
	anime: { id: string; title: string; cover_url: string | null } | null;
}

export interface BroadcastRoomOverride {
	id: string;
	anime_id: number;
	room_date: string;
	override_kind: "cancelled" | "recap" | "time_change" | "marathon" | "custom";
	broadcast_time: string | null;
	duration_minutes: number | null;
	pre_open_minutes: number | null;
	post_close_minutes: number | null;
	episode_start: number | null;
	episode_end: number | null;
	episode_label: string | null;
	episode_count_increment: number | null;
	is_cancelled: boolean;
	announcement_label: string | null;
	note: string | null;
	created_at: string;
}

export interface RoomExperimentRun {
	id: string;
	room_kind: "episode" | "event";
	anime_id?: string;
	anime_title?: string;
	anime_cover_url?: string | null;
	event_id?: string;
	event_title?: string;
	started_at: string;
	ended_at: string | null;
	label: string | null;
	notes: string | null;
}

export interface RoomExperimentRoomMetric {
	broadcast_room_session_id: string;
	room_title: string | null;
	episode_number: number | null;
	scheduled_at: string | null;
	posting_closes_at: string | null;
	visit_count: number;
	unique_visitor_count: number;
	active_visit_count: number;
	post_count: number;
	poster_count: number;
	posting_rate: number;
	posts_per_poster: number;
	posts_per_unique_visitor: number;
	average_stay_seconds: number | null;
	bounce_rate_under_60s: number | null;
	early_exit_rate: number | null;
	survey: RoomExitSurveySummary;
}

export type RoomExperimentSummaryMetric = Omit<
	RoomExperimentRoomMetric,
	"broadcast_room_session_id" | "room_title" | "episode_number" | "scheduled_at" | "posting_closes_at" | "survey"
>;

export interface RoomExperimentDashboardRun extends RoomExperimentRun {
	summary: RoomExperimentSummaryMetric;
	rooms: RoomExperimentRoomMetric[];
	survey: RoomExitSurveySummary;
}

export interface RoomExperimentAnimeSearchResult {
	id: string;
	title: string;
	cover_url: string | null;
	room_type: string;
	active_run_id: string | null;
}

export type RoomExitSurveyNextParticipation = "must_join" | "want_join" | "not_sure" | "not_really" | "not_join";

export type RoomExitSurveyComparisonWithX =
	| "anipolis_better"
	| "anipolis_slightly_better"
	| "same"
	| "x_slightly_better"
	| "x_better"
	| "cannot_compare";

export interface RoomExitSurveyComment {
	submitted_at: string;
	room_title: string | null;
	good_points: string | null;
	improvement_points: string | null;
	stayed_seconds: number;
	post_count: number;
}

export interface RoomExitSurveySummary {
	response_count: number;
	submitted_count: number;
	skipped_count: number;
	average_overall_rating: number | null;
	average_shared_experience_rating: number | null;
	average_readability_rating: number | null;
	next_participation_counts: Record<RoomExitSurveyNextParticipation, number>;
	comparison_with_x_counts: Record<RoomExitSurveyComparisonWithX, number>;
	comments: RoomExitSurveyComment[];
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
