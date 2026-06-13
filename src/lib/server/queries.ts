import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import type {
	Anime,
	AnimeExchangeItem,
	AnimeExchangeShare,
	AnimeRelation,
	AnimeResourceLink,
	AnimeStatus,
	BroadcastRoomMute,
	BroadcastRoomSession,
	BroadcastStatus,
	Event,
	Notification,
	Post,
	RawPost,
	ReactionType,
	ReactionUser,
	UserAnimeEntry,
} from "$lib/types";
import { toPost } from "$lib/types";

type NotificationActor = {
	username: string;
	display_name: string | null;
	avatar_url: string | null;
};

type NotificationPost = {
	content: string;
};

type NotificationRecommendation = {
	anime_id: number | null;
	anime: { title: string | null; cover_url: string | null } | null;
};

type NotificationBroadcastAnime = {
	id: number;
	title: string | null;
	cover_url: string | null;
};

type NotificationRow = {
	id: string;
	type: string;
	post_id: string | null;
	anime_recommendation_id: string | null;
	broadcast_anime_id: number | null;
	broadcast_scheduled_at: string | null;
	broadcast_room_date: string | null;
	read: boolean;
	created_at: string;
	actor: NotificationActor | NotificationActor[] | null;
	post: NotificationPost | NotificationPost[] | null;
	recommendation: NotificationRecommendation | NotificationRecommendation[] | null;
	broadcast_anime: NotificationBroadcastAnime | NotificationBroadcastAnime[] | null;
};

type EventRow = Omit<Database["public"]["Tables"]["events"]["Row"], "anime_id"> & {
	anime_id?: number | null;
	profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

type UserAnimeListWithAnimeRow = {
	status: AnimeStatus;
	score: number | null;
	progress: number;
	updated_at: string;
	anime: Record<string, unknown> | null;
};
type UserAnimeListWithProfileRow = {
	user_id: string;
	status: AnimeStatus;
	score: number | null;
	progress: number;
	profiles: { username: string; display_name: string | null; avatar_url: string | null; list_is_public: boolean };
};

/** 投稿一覧系クエリで共通の SELECT 句 */
const POST_LIST_SELECT = `id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, broadcast_room_session_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             broadcast_room_session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( room_date ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url, official_hashtag, broadcast_day, broadcast_time, broadcast_duration_minutes, aired_from )`;

/**
 * rawPost 配列に like_count / repost_count / reply_count / liked_by_me / reposted_by_me を付加して
 * Post[] に変換する共通ヘルパー。
 * 全ルートサーバー（タイムライン・プロフィール・ハッシュタグ・検索・詳細）で使い回す。
 */
export async function enrichPostsWithCounts(
	supabase: SupabaseClient<Database>,
	rawPosts: RawPost[],
	userId: string | null,
	options: { includeMutedRoomPosts?: boolean } = {},
): Promise<Post[]> {
	if (rawPosts.length === 0) return [];

	const mutedWordsPromise = getMutedWords(supabase, userId);
	const mutedRoomAnimeIdsPromise = options.includeMutedRoomPosts
		? Promise.resolve(new Set<string>())
		: getActiveBroadcastRoomMuteAnimeIds(supabase, userId);

	type QuotedPostRow = {
		id: string;
		content: string;
		created_at: string;
		user_id: string;
		profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
	};
	const quotedPostIds = [...new Set(rawPosts.map((p) => p.quoted_post_id).filter(Boolean))] as string[];
	const quotedPostMap = new Map<string, QuotedPostRow>();
	if (quotedPostIds.length > 0) {
		const { data: quotedRaw } = await supabase
			.from("posts")
			.select(
				"id, content, created_at, user_id, profiles!posts_user_id_fkey ( username, display_name, avatar_url )",
			)
			.in("id", quotedPostIds);
		for (const qp of quotedRaw ?? []) {
			quotedPostMap.set(qp.id, qp as QuotedPostRow);
		}
	}

	for (const raw of rawPosts) {
		if (raw.quoted_post_id && quotedPostMap.has(raw.quoted_post_id)) {
			const quotedPost = quotedPostMap.get(raw.quoted_post_id);
			if (quotedPost) raw.quoted_post = [quotedPost];
		}
	}

	const [mutedWords, mutedRoomAnimeIds] = await Promise.all([mutedWordsPromise, mutedRoomAnimeIdsPromise]);
	const visibleRawPosts = rawPosts.filter(
		(post) =>
			!(mutedWords.length > 0 && containsMutedWord(post, mutedWords)) &&
			!(post.broadcast_room_session_id && post.anime_id != null && mutedRoomAnimeIds.has(String(post.anime_id))),
	);

	if (visibleRawPosts.length === 0) return [];

	const postIds = visibleRawPosts.map((p) => p.id as string);

	// ── 並列バッチクエリ ──────────────────────────────────────────
	const [countsRes, myLikesRes, myRepostsRes, myBookmarksRes] = await Promise.all([
		supabase.rpc("get_post_engagement_counts", { target_post_ids: postIds }),
		// ログイン中ユーザーのいいね一覧
		userId
			? supabase.from("likes").select("post_id").eq("user_id", userId).in("post_id", postIds)
			: Promise.resolve({ data: [] as { post_id: string }[] }),

		// ログイン中ユーザーのリポスト一覧
		userId
			? supabase.from("reposts").select("post_id").eq("user_id", userId).in("post_id", postIds)
			: Promise.resolve({ data: [] as { post_id: string }[] }),

		userId
			? supabase.from("bookmarks").select("post_id").eq("user_id", userId).in("post_id", postIds)
			: Promise.resolve({ data: [] as { post_id: string }[] }),
	]);

	const countsByPostId = new Map((countsRes.data ?? []).map((row) => [row.post_id, row]));

	const likedSet = new Set((myLikesRes.data ?? []).map((r) => r.post_id));
	const repostedSet = new Set((myRepostsRes.data ?? []).map((r) => r.post_id));
	const bookmarkedSet = new Set((myBookmarksRes.data ?? []).map((r) => r.post_id));

	// ── アニメ引用がある投稿のスコアを一括取得 ────────────────────
	const animeIds = [...new Set(visibleRawPosts.map((p) => p.anime_id).filter(Boolean))] as string[];
	const userScoreMap = new Map<string, number | null>();
	if (userId && animeIds.length > 0) {
		const { data: entries } = await supabase
			.from("user_anime_list")
			.select("anime_id, score")
			.eq("user_id", userId)
			.in("anime_id", animeIds.map(Number));
		for (const e of entries ?? []) {
			userScoreMap.set(String(e.anime_id), e.score);
		}
	}

	return visibleRawPosts.map((raw) => {
		const post = toPost(raw, {
			like_count: countsByPostId.get(raw["id"])?.like_count ?? 0,
			repost_count: countsByPostId.get(raw["id"])?.repost_count ?? 0,
			reply_count: countsByPostId.get(raw["id"])?.reply_count ?? 0,
			liked_by_me: likedSet.has(raw["id"]),
			reposted_by_me: repostedSet.has(raw["id"]),
			bookmarked_by_me: bookmarkedSet.has(raw["id"]),
		});
		if (post.anime_quote && post.anime_id) {
			post.anime_quote.user_score = userScoreMap.get(post.anime_id) ?? null;
		}
		return post;
	});
}

export async function getMutedWords(supabase: SupabaseClient<Database>, userId: string | null): Promise<string[]> {
	if (!userId) return [];
	const { data } = await supabase
		.from("muted_words")
		.select("word")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });
	return (data ?? []).map((row) => normalizeMutedWord(row.word)).filter((word) => word.length > 0);
}

export async function getActiveBroadcastRoomMuteAnimeIds(
	supabase: SupabaseClient<Database>,
	userId: string | null,
): Promise<Set<string>> {
	if (!userId) return new Set();
	const { data } = await supabase
		.from("broadcast_room_mutes")
		.select("anime_id, duration_days, repeat_weekly, muted_until")
		.eq("user_id", userId);
	const now = Date.now();
	const weekMs = 7 * 24 * 60 * 60 * 1000;
	return new Set(
		(
			(data ?? []) as unknown as {
				anime_id: number;
				duration_days: number | null;
				repeat_weekly: boolean;
				muted_until: string;
			}[]
		)
			.filter((row) => {
				const mutedUntil = new Date(row.muted_until).getTime();
				if (!row.repeat_weekly || row.duration_days == null) return mutedUntil > now;
				const durationMs = row.duration_days * 24 * 60 * 60 * 1000;
				if (now < mutedUntil - durationMs) return false;
				if (now < mutedUntil) return true;
				const elapsedSinceFirstWindow = now - mutedUntil;
				const currentWeekOffset = elapsedSinceFirstWindow % weekMs;
				return currentWeekOffset >= weekMs - durationMs;
			})
			.map((row) => String(row.anime_id)),
	);
}

function containsMutedWord(post: RawPost, mutedWords: string[]): boolean {
	const quotedPost = Array.isArray(post.quoted_post) ? post.quoted_post[0] : post.quoted_post;
	const searchableText = [
		post.content,
		quotedPost?.content ?? "",
		post.anime?.title ?? "",
		...(post.post_hashtags ?? []).map((ph) => ph.hashtags?.name ?? ""),
	]
		.join("\n")
		.toLocaleLowerCase();

	return mutedWords.some((word) => searchableText.includes(word));
}

function normalizeMutedWord(word: string): string {
	return word.trim().toLocaleLowerCase();
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
		.from("notifications")
		.select(`
            id,
            type,
            post_id,
            anime_recommendation_id,
            broadcast_anime_id,
            broadcast_scheduled_at,
            broadcast_room_date,
            read,
            created_at,
            actor:profiles!notifications_actor_id_fkey (
                username,
                display_name,
                avatar_url
            ),
            post:posts!notifications_post_id_fkey (
                content
            ),
            recommendation:anime_recommendations!notifications_anime_recommendation_id_fkey (
                anime_id,
                anime:anime_recommendations_anime_id_fkey (
                    title,
                    cover_url
                )
            ),
            broadcast_anime:anime!notifications_broadcast_anime_id_fkey (
                id,
                title,
                cover_url
            )
        `)
		.eq("recipient_id", userId)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error || !data) return [];

	return (data as unknown as NotificationRow[]).map((row) => {
		const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
		const post = Array.isArray(row.post) ? row.post[0] : row.post;
		const recommendation = Array.isArray(row.recommendation) ? row.recommendation[0] : row.recommendation;
		const broadcastAnime = Array.isArray(row.broadcast_anime) ? row.broadcast_anime[0] : row.broadcast_anime;
		return {
			id: row["id"],
			type: row.type as Notification["type"],
			post_id: row.post_id,
			anime_recommendation_id: row.anime_recommendation_id,
			broadcast_anime_id: row.broadcast_anime_id != null ? String(row.broadcast_anime_id) : null,
			broadcast_scheduled_at: row.broadcast_scheduled_at,
			broadcast_room_date: row.broadcast_room_date,
			read: row.read,
			created_at: row.created_at,
			actor_username: actor?.username ?? "unknown",
			actor_display_name: actor?.display_name ?? null,
			actor_avatar_url: actor?.avatar_url ?? null,
			post_content: post?.content ?? "",
			recommendation_anime_id: recommendation?.anime_id != null ? String(recommendation.anime_id) : null,
			recommendation_anime_title: recommendation?.anime?.title ?? null,
			recommendation_anime_cover_url: recommendation?.anime?.cover_url ?? null,
			broadcast_anime_title: broadcastAnime?.title ?? null,
			broadcast_anime_cover_url: broadcastAnime?.cover_url ?? null,
		};
	});
}

/**
 * 未読通知数を返す（ナビゲーションバッジ用）
 */
export async function getUnreadNotificationCount(supabase: SupabaseClient<Database>, userId: string): Promise<number> {
	const { count } = await supabase
		.from("notifications")
		.select("id", { count: "exact", head: true })
		.eq("recipient_id", userId)
		.eq("read", false);

	return count ?? 0;
}

export async function getUnreadBroadcastNotificationCount(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<number> {
	const { count } = await supabase
		.from("notifications")
		.select("id", { count: "exact", head: true })
		.eq("recipient_id", userId)
		.eq("read", false)
		.eq("type", "broadcast" as never);

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
		.from("events")
		.select(`
            id, creator_id, title, description, hashtag, anime_id,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
		.gte("scheduled_at", startOfMonth)
		.lte("scheduled_at", endOfMonth)
		.order("scheduled_at", { ascending: true });

	if (error || !data) return [];
	return data.map(toEvent);
}

export async function getEventsByRange(
	supabase: SupabaseClient<Database>,
	startIso: string,
	endIso: string,
): Promise<Event[]> {
	const { data, error } = await supabase
		.from("events")
		.select(`
            id, creator_id, title, description, hashtag, anime_id,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
		.gte("scheduled_at", startIso)
		.lte("scheduled_at", endIso)
		.order("scheduled_at", { ascending: true });

	if (error || !data) return [];
	return data.map(toEvent);
}

/**
 * 直近のイベント一覧を取得する（サイドバー・トップページ用）
 */
export async function getUpcomingEvents(supabase: SupabaseClient<Database>, limit = 5): Promise<Event[]> {
	const now = new Date().toISOString();

	const { data, error } = await supabase
		.from("events")
		.select(`
            id, creator_id, title, description, hashtag, anime_id,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
		.gte("scheduled_at", now)
		.eq("is_cancelled", false)
		.order("scheduled_at", { ascending: true })
		.limit(limit);

	if (error || !data) return [];
	return data.map(toEvent);
}

/**
 * イベント単体を ID で取得する
 */
export async function getEvent(supabase: SupabaseClient<Database>, eventId: string): Promise<Event | null> {
	const { data, error } = await supabase
		.from("events")
		.select(`
            id, creator_id, title, description, hashtag, anime_id,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
		.eq("id", eventId)
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
	includeMutedRoomPosts = false,
	ascending = false,
): Promise<Post[]> {
	// ハッシュタグ ID を取得
	const { data: hashtagRow } = await supabase
		.from("hashtags")
		.select("id")
		.eq("name", hashtag.toLowerCase())
		.maybeSingle();

	if (!hashtagRow) return [];

	// post_hashtags!inner の埋め込みフィルターで絞り込む。
	// 全 post_id を取得して .in() に渡す方式は投稿数に比例して破綻する（URL長上限）ため使わない。
	// hashtag_match は絞り込み専用の別名埋め込み — 表示用の post_hashtags(hashtags(name)) は全タグを保持する。
	const { data: rawPosts } = await supabase
		.from("posts")
		.select(`${POST_LIST_SELECT},
             hashtag_match:post_hashtags!inner ( hashtag_id )`)
		.eq("hashtag_match.hashtag_id", hashtagRow["id"])
		.is("parent_id", null)
		.order("created_at", { ascending: false })
		.limit(limit);
	const orderedPosts = ascending ? [...(rawPosts ?? [])].reverse() : rawPosts;

	return enrichPostsWithCounts(supabase, (orderedPosts ?? []) as unknown as RawPost[], userId, {
		includeMutedRoomPosts,
	});
}

/**
 * 放送ルームの投稿を broadcast_room_session_id で直接取得する。
 * ルームのホットパスなのでハッシュタグ経由ではなくセッションIDの等価検索＋インデックスで引く。
 */
export async function getBroadcastRoomPosts(
	supabase: SupabaseClient<Database>,
	sessionId: string,
	userId: string | null,
	options: { limit?: number; ascending?: boolean; sinceCreatedAt?: string } = {},
): Promise<Post[]> {
	const { limit = 100, ascending = false, sinceCreatedAt } = options;

	let query = supabase
		.from("posts")
		.select(POST_LIST_SELECT)
		.eq("broadcast_room_session_id", sessionId)
		.is("parent_id", null);
	if (sinceCreatedAt) query = query.gt("created_at", sinceCreatedAt);
	const { data: rawPosts } = await query.order("created_at", { ascending: false }).limit(limit);
	const orderedPosts = ascending ? [...(rawPosts ?? [])].reverse() : rawPosts;

	// ルーム内ではそのルームのミュートを適用しない（明示的に入室しているため）
	return enrichPostsWithCounts(supabase, (orderedPosts ?? []) as unknown as RawPost[], userId, {
		includeMutedRoomPosts: true,
	});
}

// ── ヘルパー ──────────────────────────────────────────────────────

function toEvent(raw: EventRow): Event {
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
		created_at: raw["created_at"],
		creator_username: profiles?.username ?? "unknown",
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
		supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profileId),
		supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profileId),
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
		.from("follows")
		.select("follower_id")
		.eq("follower_id", followerId)
		.eq("following_id", followingId)
		.maybeSingle();
	return data !== null;
}

/**
 * 指定ユーザーがフォロー中のユーザーID一覧を返す（タイムラインフィルター用）
 */
export async function getFollowingIds(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
	const { data } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
	return (data ?? []).map((r) => r.following_id);
}

export interface ProfileSummary {
	id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
	bio: string | null;
}

export type ReportStatus = "open" | "reviewing" | "resolved" | "rejected";
export type ReportReason = "spam" | "harassment" | "sexual" | "violence" | "illegal" | "other";
export type ReportTargetType = "post" | "user";
export type ModerationStatus = "active" | "restricted" | "banned";

export interface AdminReport {
	id: string;
	reporter_id: string;
	reporter_username: string;
	reporter_display_name: string | null;
	target_type: ReportTargetType;
	target_id: string;
	target_user_id: string | null;
	target_username: string | null;
	target_display_name: string | null;
	target_moderation_status: ModerationStatus | null;
	target_moderation_until: string | null;
	target_moderation_reason: string | null;
	post_content: string | null;
	post_hidden_by_admin: boolean;
	reason: ReportReason;
	details: string | null;
	status: ReportStatus;
	created_at: string;
	updated_at: string;
}

export interface AdminDashboardData {
	stats: {
		openReports: number;
		reviewingReports: number;
		reportsToday: number;
		reportsThisWeek: number;
		usersToday: number;
		postsToday: number;
		totalUsers: number;
		totalPosts: number;
		restrictedUsers: number;
		bannedUsers: number;
	};
	reasonCounts: Array<{ reason: ReportReason; count: number }>;
	postReports: AdminReport[];
	accountReports: AdminReport[];
}

type AdminReportRow = Database["public"]["Tables"]["reports"]["Row"] & {
	reporter:
		| Pick<ProfileSummary, "username" | "display_name">
		| Pick<ProfileSummary, "username" | "display_name">[]
		| null;
	target_user:
		| Pick<ProfileSummary, "username" | "display_name">
		| Pick<ProfileSummary, "username" | "display_name">[]
		| null;
};

export type FollowRequestStatus = "none" | "pending";

export interface PendingFollowRequest {
	requester_id: string;
	target_id: string;
	created_at: string;
	requester: ProfileSummary;
}

export async function getFollowRequestStatus(
	supabase: SupabaseClient<Database>,
	requesterId: string,
	targetId: string,
): Promise<FollowRequestStatus> {
	const { data } = await supabase
		.from("follow_requests")
		.select("requester_id")
		.eq("requester_id", requesterId)
		.eq("target_id", targetId)
		.eq("status", "pending")
		.maybeSingle();
	return data ? "pending" : "none";
}

export async function getPendingFollowRequests(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<PendingFollowRequest[]> {
	const { data } = await supabase
		.from("follow_requests")
		.select(`
			requester_id,
			target_id,
			created_at,
			requester:profiles!follow_requests_requester_id_fkey (
				id,
				username,
				display_name,
				avatar_url,
				bio
			)
		`)
		.eq("target_id", userId)
		.eq("status", "pending")
		.order("created_at", { ascending: false });

	return (
		(data ?? []) as unknown as Array<{
			requester_id: string;
			target_id: string;
			created_at: string;
			requester: ProfileSummary | ProfileSummary[] | null;
		}>
	)
		.map((row) => {
			const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester;
			if (!requester) return null;
			return {
				requester_id: row.requester_id,
				target_id: row.target_id,
				created_at: row.created_at,
				requester,
			};
		})
		.filter((row): row is PendingFollowRequest => row !== null);
}

export async function getPendingFollowRequestCount(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<number> {
	const { count } = await supabase
		.from("follow_requests")
		.select("requester_id", { count: "exact", head: true })
		.eq("target_id", userId)
		.eq("status", "pending");

	return count ?? 0;
}

export async function isAdminUser(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
	const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
	return data?.is_admin === true;
}

export async function getPendingReportsCount(supabase: SupabaseClient<Database>): Promise<number> {
	const { count } = await supabase
		.from("reports")
		.select("id", { count: "exact", head: true })
		.in("status", ["open", "reviewing"]);

	return count ?? 0;
}

export async function getAdminDashboardData(supabase: SupabaseClient<Database>): Promise<AdminDashboardData> {
	const now = new Date();
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

	const [
		openReports,
		reviewingReports,
		reportsToday,
		reportsThisWeek,
		usersToday,
		postsToday,
		totalUsers,
		totalPosts,
		restrictedUsers,
		bannedUsers,
		reasonRows,
		postReports,
		accountReports,
	] = await Promise.all([
		countRows(supabase, "reports", (query) => query.eq("status", "open")),
		countRows(supabase, "reports", (query) => query.eq("status", "reviewing")),
		countRows(supabase, "reports", (query) => query.gte("created_at", today.toISOString())),
		countRows(supabase, "reports", (query) => query.gte("created_at", weekAgo.toISOString())),
		countRows(supabase, "profiles", (query) => query.gte("created_at", today.toISOString())),
		countRows(supabase, "posts", (query) => query.gte("created_at", today.toISOString())),
		countRows(supabase, "profiles"),
		countRows(supabase, "posts"),
		countRows(supabase, "account_moderation", (query) => query.eq("status", "restricted")),
		countRows(supabase, "account_moderation", (query) => query.eq("status", "banned")),
		supabase.from("reports").select("reason").gte("created_at", weekAgo.toISOString()),
		getAdminReportsByTargetType(supabase, "post"),
		getAdminReportsByTargetType(supabase, "user"),
	]);

	const reasonMap = new Map<ReportReason, number>();
	for (const row of reasonRows.data ?? []) {
		const reason = row.reason as ReportReason;
		reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
	}

	return {
		stats: {
			openReports,
			reviewingReports,
			reportsToday,
			reportsThisWeek,
			usersToday,
			postsToday,
			totalUsers,
			totalPosts,
			restrictedUsers,
			bannedUsers,
		},
		reasonCounts: [...reasonMap.entries()].map(([reason, count]) => ({ reason, count })),
		postReports,
		accountReports,
	};
}

export async function getAdminReportById(
	supabase: SupabaseClient<Database>,
	reportId: string,
): Promise<AdminReport | null> {
	const { data } = await supabase
		.from("reports")
		.select(`
			id,
			reporter_id,
			target_type,
			target_id,
			target_user_id,
			reason,
			details,
			status,
			created_at,
			updated_at,
			reporter:profiles!reports_reporter_id_fkey (
				username,
				display_name
			),
			target_user:profiles!reports_target_user_id_fkey (
				username,
				display_name
			)
		`)
		.eq("id", reportId)
		.single();

	if (!data) return null;
	const row = data as unknown as AdminReportRow;
	const postContentById = await getReportedPostContentById(supabase, [row]);
	const moderationByUserId = await getModerationByUserId(supabase, [row]);
	const postData = postContentById.get(row.target_id) ?? null;
	return toAdminReport(
		row,
		postData?.content ?? null,
		postData?.hidden_by_admin ?? false,
		row.target_user_id ? (moderationByUserId.get(row.target_user_id) ?? null) : null,
	);
}

export async function getAdminReportsByTargetType(
	supabase: SupabaseClient<Database>,
	targetType: ReportTargetType,
	limit = 25,
): Promise<AdminReport[]> {
	const { data } = await supabase
		.from("reports")
		.select(`
			id,
			reporter_id,
			target_type,
			target_id,
			target_user_id,
			reason,
			details,
			status,
			created_at,
			updated_at,
			reporter:profiles!reports_reporter_id_fkey (
				username,
				display_name
			),
			target_user:profiles!reports_target_user_id_fkey (
				username,
				display_name
			)
		`)
		.eq("target_type", targetType)
		.order("created_at", { ascending: false })
		.limit(limit);

	const rows = (data ?? []) as unknown as AdminReportRow[];
	const postContentById = await getReportedPostContentById(supabase, rows);
	const moderationByUserId = await getModerationByUserId(supabase, rows);

	return rows.map((row) => {
		const postData = postContentById.get(row.target_id) ?? null;
		return toAdminReport(
			row,
			postData?.content ?? null,
			postData?.hidden_by_admin ?? false,
			row.target_user_id ? (moderationByUserId.get(row.target_user_id) ?? null) : null,
		);
	});
}

async function getReportedPostContentById(
	supabase: SupabaseClient<Database>,
	rows: AdminReportRow[],
): Promise<Map<string, { content: string; hidden_by_admin: boolean }>> {
	const postIds = rows.filter((row) => row.target_type === "post").map((row) => row.target_id);
	const postContentById = new Map<string, { content: string; hidden_by_admin: boolean }>();
	if (postIds.length === 0) return postContentById;

	const { data: posts } = await supabase.from("posts").select("id, content, hidden_by_admin").in("id", postIds);
	for (const post of posts ?? []) {
		postContentById.set(post.id, { content: post.content, hidden_by_admin: post.hidden_by_admin });
	}
	return postContentById;
}

async function getModerationByUserId(
	supabase: SupabaseClient<Database>,
	rows: AdminReportRow[],
): Promise<Map<string, { status: ModerationStatus; restricted_until: string | null; reason: string | null }>> {
	const targetUserIds = [...new Set(rows.map((row) => row.target_user_id).filter((id): id is string => id !== null))];
	const moderationByUserId = new Map<
		string,
		{ status: ModerationStatus; restricted_until: string | null; reason: string | null }
	>();
	if (targetUserIds.length === 0) return moderationByUserId;

	const { data: moderationRows } = await supabase
		.from("account_moderation")
		.select("user_id, status, restricted_until, reason")
		.in("user_id", targetUserIds);
	for (const row of moderationRows ?? []) {
		moderationByUserId.set(row.user_id, {
			status: row.status as ModerationStatus,
			restricted_until: row.restricted_until,
			reason: row.reason,
		});
	}
	return moderationByUserId;
}

type CountableTable = "reports" | "profiles" | "posts" | "account_moderation";

async function countRows(
	supabase: SupabaseClient<Database>,
	table: CountableTable,
	apply?: (query: CountQuery) => CountQuery,
): Promise<number> {
	let query = supabase.from(table).select("*", { count: "exact", head: true }) as unknown as CountQuery;
	if (apply) query = apply(query);
	const { count } = await query;
	return count ?? 0;
}

type CountQuery = {
	eq: (column: string, value: string) => CountQuery;
	gte: (column: string, value: string) => CountQuery;
	then: Promise<{ count: number | null }>["then"];
};

function toAdminReport(
	row: AdminReportRow,
	postContent: string | null,
	postHiddenByAdmin: boolean,
	moderation: { status: ModerationStatus; restricted_until: string | null; reason: string | null } | null,
): AdminReport {
	const reporter = Array.isArray(row.reporter) ? row.reporter[0] : row.reporter;
	const targetUser = Array.isArray(row.target_user) ? row.target_user[0] : row.target_user;
	return {
		id: row.id,
		reporter_id: row.reporter_id,
		reporter_username: reporter?.username ?? "unknown",
		reporter_display_name: reporter?.display_name ?? null,
		target_type: row.target_type,
		target_id: row.target_id,
		target_user_id: row.target_user_id,
		target_username: targetUser?.username ?? null,
		target_display_name: targetUser?.display_name ?? null,
		target_moderation_status: moderation?.status ?? "active",
		target_moderation_until: moderation?.restricted_until ?? null,
		target_moderation_reason: moderation?.reason ?? null,
		post_content: postContent,
		post_hidden_by_admin: postHiddenByAdmin,
		reason: row.reason,
		details: row.details,
		status: row.status,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export async function getFollowerProfiles(
	supabase: SupabaseClient<Database>,
	profileId: string,
): Promise<ProfileSummary[]> {
	const { data: follows } = await supabase.from("follows").select("follower_id").eq("following_id", profileId);
	const ids = (follows ?? []).map((r) => r.follower_id);
	if (ids.length === 0) return [];
	const { data } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url, bio")
		.in("id", ids);
	return (data ?? []) as ProfileSummary[];
}

export async function getFollowingProfiles(
	supabase: SupabaseClient<Database>,
	profileId: string,
): Promise<ProfileSummary[]> {
	const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", profileId);
	const ids = (follows ?? []).map((r) => r.following_id);
	if (ids.length === 0) return [];
	const { data } = await supabase
		.from("profiles")
		.select("id, username, display_name, avatar_url, bio")
		.in("id", ids);
	return (data ?? []) as ProfileSummary[];
}

export async function getBookmarkedPosts(supabase: SupabaseClient<Database>, userId: string): Promise<Post[]> {
	const { data: bookmarkRows } = await supabase
		.from("bookmarks")
		.select("post_id")
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(50);
	const postIds = (bookmarkRows ?? []).map((r) => r["post_id"]);
	if (postIds.length === 0) return [];
	const { data: rawPosts } = await supabase
		.from("posts")
		.select(
			`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, broadcast_room_session_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             broadcast_room_session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( room_date ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url, official_hashtag, broadcast_day, broadcast_time, broadcast_duration_minutes, aired_from )`,
		)
		.in("id", postIds);
	// ブックマーク保存順を維持するため postIds の順序に並べ直す
	const orderMap = new Map(postIds.map((id, i) => [id, i]));
	const sorted = ((rawPosts ?? []) as unknown as RawPost[]).sort(
		(a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
	);
	return enrichPostsWithCounts(supabase, sorted, userId);
}

export async function getLikedPosts(
	supabase: SupabaseClient<Database>,
	profileId: string,
	currentUserId: string | null,
): Promise<Post[]> {
	const { data: likeRows } = await supabase
		.from("likes")
		.select("post_id")
		.eq("user_id", profileId)
		.order("created_at", { ascending: false })
		.limit(50);
	const postIds = (likeRows ?? []).map((r) => r.post_id);
	if (postIds.length === 0) return [];
	const { data: rawPosts } = await supabase
		.from("posts")
		.select(
			`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, broadcast_room_session_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             broadcast_room_session:broadcast_room_sessions!posts_broadcast_room_session_id_fkey ( room_date ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url, official_hashtag, broadcast_day, broadcast_time, broadcast_duration_minutes, aired_from )`,
		)
		.in("id", postIds)
		.order("created_at", { ascending: false });
	return enrichPostsWithCounts(supabase, (rawPosts ?? []) as unknown as RawPost[], currentUserId);
}

export async function getPostReactionUsers(
	supabase: SupabaseClient<Database>,
	postId: string,
	actionType: ReactionType,
): Promise<ReactionUser[]> {
	type ReactionUsersRpc = (
		name: string,
		args: { target_post_id: string; action_type: ReactionType },
	) => PromiseLike<{ data: ReactionUser[] | null; error: { message: string } | null }>;

	// This RPC is introduced by migration 062; generated Supabase types are refreshed separately.
	const { data, error } = await (supabase.rpc as unknown as ReactionUsersRpc)("get_post_reaction_users", {
		target_post_id: postId,
		action_type: actionType,
	});
	if (error) {
		console.error("post reaction users query error (postId=%s, type=%s):", postId, actionType, error.message);
		throw new Error("リアクションしたユーザーの取得に失敗しました");
	}
	return data ?? [];
}

// ================================================================
// アニメ クエリ
// ================================================================

export interface AnimeListOptions {
	season?: string;
	broadcastYear?: string;
	broadcastSeason?: string;
	scheduleRange?: { start: string; end: string };
	genre?: string;
	genres?: string[];
	studio?: string;
	producer?: string;
	broadcastStatus?: Exclude<BroadcastStatus, "unknown">;
	sortBy?: "popular" | "trending" | "top_rated" | "created";
	listedByUserId?: string | null;
	limit?: number;
	userId?: string | null;
	query?: string;
}

/**
 * 一覧表示に必要なカラムのみ（synopsis / title_romaji / 公式URL等の重い未使用
 * テキスト列を除外）。一覧は最大1000件をHTMLにシリアライズするため、
 * 行あたりのサイズがそのままページ重量になる。詳細ページは getAnime が全列を返す。
 */
const ANIME_LIST_BASE_COLUMN_NAMES = [
	"id",
	"title",
	"title_en",
	"cover_url",
	"episode_count",
	"type",
	"status",
	"season",
	"studio",
	"studio_en",
	"producer",
	"genre",
	"genre_en",
	"official_hashtag",
	"created_at",
	"broadcast_day",
	"broadcast_time",
	"broadcast_station",
	"broadcast_duration_minutes",
	"broadcast_room_pre_open_minutes",
	"broadcast_room_post_close_minutes",
	"aired_from",
	"aired_to",
	"hidden_by_admin",
];

/** ベーステーブル（anime）用 — computed_broadcast_status はビューにしかない */
const ANIME_LIST_BASE_COLUMNS = ANIME_LIST_BASE_COLUMN_NAMES.join(", ");
const ANIME_LIST_COLUMNS = [...ANIME_LIST_BASE_COLUMN_NAMES, "computed_broadcast_status"].join(", ");

/**
 * アニメ一覧を取得する（season / status フィルター対応）
 */
export async function getAnimeList(
	supabase: SupabaseClient<Database>,
	options: AnimeListOptions = {},
): Promise<Anime[]> {
	const {
		season,
		broadcastYear,
		broadcastSeason,
		scheduleRange,
		genre,
		genres,
		studio,
		producer,
		broadcastStatus,
		sortBy = "created",
		listedByUserId,
		limit = 20,
		userId,
		query: searchQuery,
	} = options;
	const selectedGenres = normalizeGenreFilters(genres ?? genre);
	const listedAnimeIds = listedByUserId ? await getListedAnimeIds(supabase, listedByUserId) : null;
	if (listedAnimeIds && listedAnimeIds.length === 0) return [];

	let query = supabase
		.from("anime_with_computed_broadcast_status")
		.select(ANIME_LIST_COLUMNS)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (listedAnimeIds) query = query.in("id", listedAnimeIds);
	if (season) query = query.eq("season", season);
	const seasonFilter = buildSeasonFilter(undefined, broadcastSeason);
	if (seasonFilter) query = query.or(seasonFilter);
	if (broadcastYear) query = applyAiredYearFilter(query, broadcastYear);
	if (scheduleRange) {
		query = query
			.not("broadcast_day", "is", null)
			.or(`aired_from.is.null,aired_from.lte.${scheduleRange.end}`)
			.or(`aired_to.is.null,aired_to.gte.${scheduleRange.start}`);
	}
	if (selectedGenres.length) query = query.or(buildGenreFilter(selectedGenres));
	if (studio) query = query.or(arrayContainsAny(["studio", "studio_en"], studio));
	if (producer) query = query.contains("producer", [producer]);
	if (broadcastStatus) query = query.eq("computed_broadcast_status", broadcastStatus);
	if (searchQuery) query = query.or(buildTitleSearchFilter(searchQuery));

	const { data, error } = await query;
	const rows =
		error || !data ? await getAnimeListRowsFromBaseTable(supabase, options, seasonFilter, listedAnimeIds) : data;
	if (rows.length === 0) return [];

	const mappedAnimes = (rows as Record<string, unknown>[])
		.map((row, index) => ({ anime: toAnime(row), index }))
		.filter(({ anime }) => !broadcastStatus || anime.computed_broadcast_status === broadcastStatus);
	await sortAnimeListItems(supabase, mappedAnimes, sortBy, selectedGenres);
	const animes: Anime[] = mappedAnimes.map(({ anime }) => anime);
	if (userId) return enrichAnimeWithUserEntries(supabase, animes, userId);
	return animes;
}

export async function getAnimeCount(
	supabase: SupabaseClient<Database>,
	options: Pick<
		AnimeListOptions,
		"genre" | "genres" | "broadcastYear" | "broadcastSeason" | "studio" | "producer" | "query"
	>,
): Promise<number> {
	const { genre, genres, broadcastYear, broadcastSeason, studio, producer, query: searchQuery } = options;
	const selectedGenres = normalizeGenreFilters(genres ?? genre);

	let q = supabase.from("anime_with_computed_broadcast_status").select("id", { count: "exact", head: true });

	const seasonFilter = buildSeasonFilter(undefined, broadcastSeason);
	if (seasonFilter) q = q.or(seasonFilter);
	if (broadcastYear) q = applyAiredYearFilter(q, broadcastYear);
	if (selectedGenres.length) q = q.or(buildGenreFilter(selectedGenres));
	if (studio) q = q.or(arrayContainsAny(["studio", "studio_en"], studio));
	if (producer) q = q.contains("producer", [producer]);
	if (searchQuery) q = q.or(buildTitleSearchFilter(searchQuery));

	const { count, error } = await q;

	if (error || count === null) {
		let fallback = supabase.from("anime").select("id", { count: "exact", head: true });
		if (seasonFilter) fallback = fallback.or(seasonFilter);
		if (broadcastYear) fallback = applyAiredYearFilter(fallback, broadcastYear);
		if (selectedGenres.length) fallback = fallback.or(buildGenreFilter(selectedGenres));
		if (studio) fallback = fallback.or(arrayContainsAny(["studio", "studio_en"], studio));
		if (producer) fallback = fallback.contains("producer", [producer]);
		if (searchQuery) fallback = fallback.or(buildTitleSearchFilter(searchQuery));
		const { count: fallbackCount } = await fallback;
		return fallbackCount ?? 0;
	}

	return count;
}

async function getAnimeListRowsFromBaseTable(
	supabase: SupabaseClient<Database>,
	options: AnimeListOptions,
	seasonFilter: string | null,
	listedAnimeIds: number[] | null = null,
): Promise<Record<string, unknown>[]> {
	const {
		season,
		broadcastYear,
		scheduleRange,
		genre,
		genres,
		studio,
		producer,
		limit = 20,
		query: searchQuery,
	} = options;
	const selectedGenres = normalizeGenreFilters(genres ?? genre);

	let query = supabase
		.from("anime")
		.select(ANIME_LIST_BASE_COLUMNS)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (listedAnimeIds) query = query.in("id", listedAnimeIds);
	if (season) query = query.eq("season", season);
	if (seasonFilter) query = query.or(seasonFilter);
	if (broadcastYear) query = applyAiredYearFilter(query, broadcastYear);
	if (scheduleRange) {
		query = query
			.not("broadcast_day", "is", null)
			.or(`aired_from.is.null,aired_from.lte.${scheduleRange.end}`)
			.or(`aired_to.is.null,aired_to.gte.${scheduleRange.start}`);
	}
	if (selectedGenres.length) query = query.or(buildGenreFilter(selectedGenres));
	if (studio) query = query.or(arrayContainsAny(["studio", "studio_en"], studio));
	if (producer) query = query.contains("producer", [producer]);
	if (searchQuery) query = query.or(buildTitleSearchFilter(searchQuery));

	const { data } = await query;
	return (data ?? []) as unknown as Record<string, unknown>[];
}

function buildSeasonFilter(year: string | undefined, season: string | undefined): string | null {
	// 年は4桁数字のみ受け付ける（.or() 文字列への注入を防ぐ）
	const trimmedYear = year?.trim();
	const normalizedYear = trimmedYear && /^\d{4}$/.test(trimmedYear) ? trimmedYear : undefined;
	const normalizedSeason = season?.trim();
	if (!normalizedYear && !normalizedSeason) return null;

	if (normalizedYear && normalizedSeason) {
		return seasonSearchTerms(normalizedSeason)
			.map((term) => `season.ilike.${quoteOrFilterValue(`${normalizedYear}%${term}`)}`)
			.join(",");
	}

	if (normalizedYear) return `season.ilike.${quoteOrFilterValue(`${normalizedYear}%`)}`;

	return seasonSearchTerms(normalizedSeason ?? "")
		.flatMap((term) => [
			`season.ilike.${quoteOrFilterValue(`%${term}`)}`,
			`season.ilike.${quoteOrFilterValue(`%-${term}`)}`,
		])
		.join(",");
}

/**
 * PostgREST の .or() フィルターに埋め込む値を二重引用符リテラル化する。
 * カンマ・括弧はフィルター構文のトークンとして解釈され条件注入につながるため、
 * ユーザー入力を .or() 文字列に連結する際は必ずこれで包むこと。
 */
export function quoteOrFilterValue(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** title / title_en の部分一致検索用 .or() フィルターを生成する（入力は引用符リテラル化される） */
export function buildTitleSearchFilter(searchQuery: string): string {
	const pattern = quoteOrFilterValue(`%${searchQuery}%`);
	return `title.ilike.${pattern},title_en.ilike.${pattern}`;
}

function arrayContainsAny(columns: string[], value: string) {
	const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const literal = `{"${escaped}"}`;
	return columns.map((column) => `${column}.cs.${literal}`).join(",");
}

function buildGenreFilter(genres: string[]): string {
	return genres
		.filter(Boolean)
		.map((genre) => arrayContainsAny(["genre", "genre_en"], genre))
		.join(",");
}

function normalizeGenreFilters(value: string | string[] | undefined): string[] {
	const rawGenres = Array.isArray(value) ? value : (value ?? "").split(",");
	return [...new Set(rawGenres.map((genre) => genre.trim()).filter(Boolean))];
}

function applyAiredYearFilter<
	T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T },
>(query: T, year: string): T {
	const normalizedYear = /^\d{4}$/.test(year.trim()) ? Number(year) : null;
	if (normalizedYear === null) return query;
	return query.gte("aired_from", `${normalizedYear}-01-01`).lt("aired_from", `${normalizedYear + 1}-01-01`);
}

function countGenreMatches(anime: Anime, selectedGenres: string[]): number {
	const animeGenres = new Set(
		[...(anime.genre ?? []), ...(anime.genre_en ?? [])].map((genre) => genre.toLowerCase()),
	);
	return selectedGenres.reduce((count, genre) => count + (animeGenres.has(genre.toLowerCase()) ? 1 : 0), 0);
}

async function getListedAnimeIds(supabase: SupabaseClient<Database>, userId: string): Promise<number[]> {
	const { data, error } = await supabase.from("user_anime_list").select("anime_id").eq("user_id", userId);
	if (error || !data) return [];
	return data.map((row) => Number(row.anime_id)).filter((id) => Number.isFinite(id));
}

async function sortAnimeListItems(
	supabase: SupabaseClient<Database>,
	items: { anime: Anime; index: number }[],
	sortBy: NonNullable<AnimeListOptions["sortBy"]>,
	selectedGenres: string[],
): Promise<void> {
	if (items.length === 0) return;

	if (sortBy === "created") {
		if (selectedGenres.length) {
			items.sort(
				(a, b) =>
					countGenreMatches(b.anime, selectedGenres) - countGenreMatches(a.anime, selectedGenres) ||
					a.index - b.index,
			);
		}
		return;
	}

	const metrics = await getAnimeRankingMetrics(
		supabase,
		items.map(({ anime }) => anime.id),
		sortBy,
	);
	for (const { anime } of items) {
		const metric = metrics.get(anime.id);
		if (!metric) continue;
		if (sortBy === "popular") anime.list_count = metric.primary;
		if (sortBy === "trending") anime.recent_count = metric.primary;
		if (sortBy === "top_rated") {
			anime.avg_score = metric.primary;
			anime.score_count = metric.secondary;
		}
	}

	items.sort((a, b) => {
		const aMetric = metrics.get(a.anime.id);
		const bMetric = metrics.get(b.anime.id);
		const metricDelta = (bMetric?.primary ?? 0) - (aMetric?.primary ?? 0);
		if (metricDelta !== 0) return metricDelta;
		if (sortBy === "top_rated") {
			const scoreCountDelta = (bMetric?.secondary ?? 0) - (aMetric?.secondary ?? 0);
			if (scoreCountDelta !== 0) return scoreCountDelta;
		}
		if (selectedGenres.length) {
			const genreDelta = countGenreMatches(b.anime, selectedGenres) - countGenreMatches(a.anime, selectedGenres);
			if (genreDelta !== 0) return genreDelta;
		}
		return a.index - b.index;
	});
}

async function getAnimeRankingMetrics(
	supabase: SupabaseClient<Database>,
	animeIds: string[],
	sortBy: Exclude<NonNullable<AnimeListOptions["sortBy"]>, "created">,
): Promise<Map<string, { primary: number; secondary: number }>> {
	const ids = animeIds.map(Number).filter((id) => Number.isFinite(id));
	if (ids.length === 0) return new Map();

	if (sortBy === "popular") {
		const { data } = await supabase.from("anime_popularity").select("anime_id, list_count").in("anime_id", ids);
		return new Map(
			(data ?? []).map((row) => [String(row.anime_id), { primary: Number(row.list_count ?? 0), secondary: 0 }]),
		);
	}

	if (sortBy === "trending") {
		const { data } = await supabase.from("anime_trending").select("anime_id, recent_count").in("anime_id", ids);
		return new Map(
			(data ?? []).map((row) => [String(row.anime_id), { primary: Number(row.recent_count ?? 0), secondary: 0 }]),
		);
	}

	const { data } = await supabase
		.from("anime_top_rated")
		.select("anime_id, avg_score, score_count")
		.in("anime_id", ids);
	return new Map(
		(data ?? []).map((row) => [
			String(row.anime_id),
			{ primary: Number(row.avg_score ?? 0), secondary: Number(row.score_count ?? 0) },
		]),
	);
}

function seasonSearchTerms(season: string): string[] {
	const aliases: Record<string, string[]> = {
		春: ["春", "spring"],
		夏: ["夏", "summer"],
		秋: ["秋", "autumn", "fall"],
		冬: ["冬", "winter"],
		spring: ["spring", "春"],
		summer: ["summer", "夏"],
		autumn: ["autumn", "fall", "秋"],
		fall: ["fall", "autumn", "秋"],
		winter: ["winter", "冬"],
	};

	return [...new Set(aliases[season.toLowerCase()] ?? [season])];
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
		.from("anime_with_computed_broadcast_status")
		.select("*")
		.eq("id", Number(animeId))
		.maybeSingle();

	const animeRow =
		error || !data ? (await supabase.from("anime").select("*").eq("id", Number(animeId)).maybeSingle()).data : data;

	if (!animeRow) return null;

	const anime = toAnime(animeRow as Record<string, unknown>);

	const [popularityRes, trendingRes, topRatedRes] = await Promise.all([
		supabase
			.from("anime_popularity" as never)
			.select("list_count")
			.eq("anime_id", animeId)
			.maybeSingle(),
		supabase
			.from("anime_trending" as never)
			.select("recent_count")
			.eq("anime_id", animeId)
			.maybeSingle(),
		supabase
			.from("anime_top_rated" as never)
			.select("avg_score, score_count")
			.eq("anime_id", animeId)
			.maybeSingle(),
	]);

	anime.list_count = (popularityRes.data as { list_count?: number } | null)?.list_count ?? 0;
	anime.recent_count = (trendingRes.data as { recent_count?: number } | null)?.recent_count ?? 0;
	anime.avg_score = (topRatedRes.data as { avg_score?: number | null } | null)?.avg_score ?? null;
	anime.score_count = (topRatedRes.data as { score_count?: number } | null)?.score_count ?? 0;

	if (userId) {
		const { data: entry } = await supabase
			.from("user_anime_list")
			.select("status, score, progress, updated_at")
			.eq("anime_id", Number(animeId))
			.eq("user_id", userId)
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

export async function getAnimeRelations(
	supabase: SupabaseClient<Database>,
	malId: number | null,
): Promise<AnimeRelation[]> {
	if (malId == null) return [];

	const { data, error } = await supabase
		.from("anime_relations" as never)
		.select("relation_type, related_anime_mal_id, related_title")
		.eq("anime_mal_id", malId);

	if (error || !data) return [];

	const rows = data as unknown as Omit<AnimeRelation, "anime">[];
	const relatedMalIds = [...new Set(rows.map((row) => row.related_anime_mal_id))];
	const { data: relatedAnimes } =
		relatedMalIds.length > 0
			? await supabase.from("anime").select("id, mal_id, title, cover_url").in("mal_id", relatedMalIds)
			: { data: [] };
	const animesByMalId = new Map(
		(relatedAnimes ?? [])
			.filter((anime) => anime.mal_id != null)
			.map((anime) => [
				anime.mal_id as number,
				{ id: String(anime.id), title: anime.title, cover_url: anime.cover_url },
			]),
	);

	return rows.map((row) => ({
		...row,
		anime: animesByMalId.get(row.related_anime_mal_id) ?? null,
	}));
}

/**
 * 人気ランキング（総マイリスト登録数順）
 */
export async function getAnimeRankingPopularity(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const { data, error } = await supabase
		.from("anime_popularity")
		.select("anime_id, list_count")
		.order("list_count", { ascending: false })
		.order("anime_id", { ascending: true })
		.limit(limit);
	if (error || !data || data.length === 0) return [];

	const rankedIds = data.map((row) => String(row.anime_id));
	const countMap = new Map(data.map((row) => [String(row.anime_id), Number(row.list_count)]));
	const animes = await fetchAnimesByIds(supabase, rankedIds);
	return animes.map((a) => ({ ...a, list_count: countMap.get(a.id) ?? 0 }));
}

/**
 * トレンドランキング（直近7日間のアクティビティ順）
 */
export async function getAnimeRankingTrending(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const { data, error } = await supabase
		.from("anime_trending")
		.select("anime_id, recent_count")
		.order("recent_count", { ascending: false })
		.order("anime_id", { ascending: true })
		.limit(limit);
	if (error || !data || data.length === 0) return [];

	const rankedIds = data.map((row) => String(row.anime_id));
	const countMap = new Map(data.map((row) => [String(row.anime_id), Number(row.recent_count)]));
	const animes = await fetchAnimesByIds(supabase, rankedIds);
	return animes.map((a) => ({ ...a, recent_count: countMap.get(a.id) ?? 0 }));
}

/**
 * 高評価ランキング（平均スコア順）
 */
export async function getAnimeRankingTopRated(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const { data, error } = await supabase
		.from("anime_top_rated")
		.select("anime_id, avg_score, score_count")
		.order("avg_score", { ascending: false })
		.order("score_count", { ascending: false })
		.order("anime_id", { ascending: true })
		.limit(limit);
	if (error || !data || data.length === 0) return [];

	const rankedIds = data.map((row) => String(row.anime_id));
	const avgMap = new Map(data.map((row) => [String(row.anime_id), Number(row.avg_score)]));
	const cntMap = new Map(data.map((row) => [String(row.anime_id), Number(row.score_count)]));
	const animes = await fetchAnimesByIds(supabase, rankedIds);
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
	let query = supabase
		.from("user_anime_list")
		.select(`status, score, progress, updated_at, anime:anime_id(${ANIME_LIST_BASE_COLUMNS})`)
		.eq("user_id", userId)
		.order("updated_at", { ascending: false });

	if (status) query = query.eq("status", status);

	const { data, error } = await query;
	if (error || !data) return [];

	return (data as unknown as UserAnimeListWithAnimeRow[])
		.filter((row): row is UserAnimeListWithAnimeRow & { anime: Record<string, unknown> } => row.anime !== null)
		.map((row) => ({
			...toAnime(row.anime),
			user_entry: {
				status: row.status as AnimeStatus,
				score: row.score as number | null,
				progress: row.progress as number,
				updated_at: row.updated_at as string,
			} satisfies UserAnimeEntry,
		}));
}

export interface AnimeListUser {
	user_id: string;
	username: string;
	display_name: string | null;
	avatar_url: string | null;
	status: AnimeStatus;
	score: number | null;
	progress: number;
}

export async function getUsersWhoListedAnime(
	supabase: SupabaseClient<Database>,
	animeId: string,
	limit = 24,
): Promise<AnimeListUser[]> {
	const { data, error } = await supabase
		.from("user_anime_list")
		.select("user_id, status, score, progress, profiles!inner(username, display_name, avatar_url, list_is_public)")
		.eq("anime_id", Number(animeId))
		.order("updated_at", { ascending: false })
		.limit(limit * 2);

	if (error || !data) return [];

	return (data as UserAnimeListWithProfileRow[])
		.filter((row) => row.profiles?.list_is_public === true)
		.slice(0, limit)
		.map((row) => ({
			user_id: row.user_id,
			username: row.profiles.username as string,
			display_name: row.profiles.display_name as string | null,
			avatar_url: row.profiles.avatar_url as string | null,
			status: row.status as AnimeStatus,
			score: row.score as number | null,
			progress: row.progress as number,
		}));
}

export async function getAnimeExchangeEntries(
	supabase: SupabaseClient<Database>,
	userId: string,
	limit = 20,
): Promise<AnimeExchangeItem[]> {
	const { data, error } = await (
		supabase as unknown as {
			from: (table: "anime_exchange_entries") => {
				select: (columns: string) => {
					eq: (
						column: "user_id",
						value: string,
					) => {
						order: (
							column: "created_at",
							options: { ascending: boolean },
						) => {
							limit: (count: number) => Promise<{ data: unknown[] | null; error: unknown | null }>;
						};
					};
				};
			};
		}
	)
		.from("anime_exchange_entries")
		.select(`
            id,
            status,
            created_at,
            matched_at,
            comment,
            received_entry_id,
            anime:anime_exchange_entries_anime_id_fkey (
                id,
                title,
                title_en,
                cover_url
            )
        `)
		.eq("user_id", userId)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error || !data) return [];
	const baseRows = data as Record<string, unknown>[];
	const baseItems = baseRows
		.map((row) => toAnimeExchangeItem(row))
		.filter((item): item is AnimeExchangeItem => item !== null);
	const receivedEntryIds = [
		...new Set(
			baseRows
				.map((row) => row["received_entry_id"])
				.filter((v): v is string => typeof v === "string" && v.length > 0),
		),
	];
	if (receivedEntryIds.length === 0) return baseItems;

	const { data: receivedRows, error: receivedError } = await supabase
		.from("anime_exchange_entries")
		.select(`
			id,
			comment,
			anime:anime_exchange_entries_anime_id_fkey (
				id,
				title,
				title_en,
				cover_url
			)
		`)
		.in("id", receivedEntryIds);

	if (receivedError || !receivedRows) return baseItems;

	const receivedEntryById = new Map<string, Pick<AnimeExchangeItem, "received_anime" | "received_comment">>();
	for (const row of receivedRows as Record<string, unknown>[]) {
		const animeValue = row["anime"];
		const anime = Array.isArray(animeValue) ? animeValue[0] : animeValue;
		if (!anime || typeof anime !== "object" || !row["id"]) continue;
		const animeRecord = anime as Record<string, unknown>;
		receivedEntryById.set(String(row["id"]), {
			received_anime: {
				id: String(animeRecord["id"]),
				title: String(animeRecord["title"]),
				title_en: typeof animeRecord["title_en"] === "string" ? animeRecord["title_en"] : null,
				cover_url: typeof animeRecord["cover_url"] === "string" ? animeRecord["cover_url"] : null,
			},
			received_comment: typeof row["comment"] === "string" ? row["comment"] : null,
		});
	}

	return baseItems.map((item, index) => {
		const receivedEntryId = baseRows[index]?.["received_entry_id"];
		const receivedAnime =
			typeof receivedEntryId === "string" && receivedEntryId.length > 0
				? (receivedEntryById.get(receivedEntryId)?.received_anime ?? null)
				: null;
		const receivedComment =
			typeof receivedEntryId === "string" && receivedEntryId.length > 0
				? (receivedEntryById.get(receivedEntryId)?.received_comment ?? null)
				: null;
		return { ...item, received_anime: receivedAnime, received_comment: receivedComment };
	});
}

// ── ヘルパー ──────────────────────────────────────────────────────

function toExchangeShareAnime(value: unknown): AnimeExchangeShare["offered_anime"] | null {
	const anime = Array.isArray(value) ? value[0] : value;
	if (!anime || typeof anime !== "object") return null;
	const record = anime as Record<string, unknown>;
	if (record["id"] === undefined || record["title"] === undefined) return null;
	return {
		id: String(record["id"]),
		title: String(record["title"]),
		title_en: typeof record["title_en"] === "string" ? record["title_en"] : null,
		cover_url: typeof record["cover_url"] === "string" ? record["cover_url"] : null,
	};
}

const EXCHANGE_SHARE_SELECT = `comment, received_entry_id,
            anime:anime_exchange_entries_anime_id_fkey ( id, title, title_en, cover_url )`;

export async function getAnimeExchangeShareForUser(
	supabase: SupabaseClient<Database>,
	userId: string,
	exchangeId: string,
): Promise<AnimeExchangeShare | null> {
	// 共有対象の1件を直接引く（以前は一覧50件を取得してから探していた）
	const { data: entry } = await supabase
		.from("anime_exchange_entries")
		.select(EXCHANGE_SHARE_SELECT)
		.eq("id", exchangeId)
		.eq("user_id", userId)
		.maybeSingle();

	const entryRecord = entry as Record<string, unknown> | null;
	const receivedEntryId = entryRecord?.["received_entry_id"];
	if (!entryRecord || typeof receivedEntryId !== "string" || receivedEntryId.length === 0) return null;

	const offeredAnime = toExchangeShareAnime(entryRecord["anime"]);
	if (!offeredAnime) return null;

	const { data: received } = await supabase
		.from("anime_exchange_entries")
		.select(EXCHANGE_SHARE_SELECT)
		.eq("id", receivedEntryId)
		.maybeSingle();

	const receivedRecord = received as Record<string, unknown> | null;
	const receivedAnime = receivedRecord ? toExchangeShareAnime(receivedRecord["anime"]) : null;
	if (!receivedAnime) return null;

	return {
		type: "anime_exchange",
		offered_anime: offeredAnime,
		received_anime: receivedAnime,
		offered_comment: typeof entryRecord["comment"] === "string" ? entryRecord["comment"] : null,
		received_comment:
			typeof receivedRecord?.["comment"] === "string" ? (receivedRecord["comment"] as string) : null,
	};
}

function toAnime(raw: Record<string, unknown>): Anime {
	const rawMalId = raw["mal_id"];

	return {
		id: String(raw["id"]),
		mal_id:
			typeof rawMalId === "number"
				? rawMalId
				: typeof rawMalId === "string"
					? Number.parseInt(rawMalId, 10) || null
					: null,
		title: String(raw["title"]),
		title_en: (raw["title_en"] as string | null) ?? null,
		title_romaji: (raw["title_romaji"] as string | null) ?? null,
		synopsis: (raw["synopsis"] as string | null) ?? null,
		cover_url: (raw["cover_url"] as string | null) ?? null,
		season: (raw["season"] as string | null) ?? null,
		episode_count: (raw["episode_count"] as string | null) || null,
		type: (raw["type"] as string | null) ?? null,
		status: (raw["status"] as string | null) ?? null,
		computed_broadcast_status: toBroadcastStatus(raw),
		aired_from: (raw["aired_from"] as string | null) ?? null,
		aired_to: (raw["aired_to"] as string | null) ?? null,
		source: (raw["source"] as string | null) ?? null,
		studio: (raw["studio"] as string[] | null) ?? null,
		studio_en: (raw["studio_en"] as string[] | null) ?? null,
		producer: (raw["producer"] as string[] | null) ?? null,
		genre: (raw["genre"] as string[] | null) ?? null,
		genre_en: (raw["genre_en"] as string[] | null) ?? null,
		official_site_url: (raw["official_site_url"] as string | null) ?? null,
		official_x_url: (raw["official_x_url"] as string | null) ?? null,
		official_hashtag: (raw["official_hashtag"] as string[] | null) ?? null,
		resources: toAnimeResourceLinks(raw["resources"]),
		copyright: (raw["copyright"] as string | null) ?? null,
		broadcast_day: (raw["broadcast_day"] as number | null) ?? null,
		broadcast_time: (raw["broadcast_time"] as string | null) ?? null,
		broadcast_duration_minutes: (raw["broadcast_duration_minutes"] as number | null) ?? 30,
		broadcast_room_pre_open_minutes: (raw["broadcast_room_pre_open_minutes"] as number | null) ?? 5,
		broadcast_room_post_close_minutes: (raw["broadcast_room_post_close_minutes"] as number | null) ?? 30,
		broadcast_station: (raw["broadcast_station"] as string[] | null) ?? null,
		hidden_by_admin: raw["hidden_by_admin"] === true,
		created_at: String(raw["created_at"]),
	};
}

function toAnimeResourceLinks(value: unknown): AnimeResourceLink[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const resource = item as Record<string, unknown>;
			const name = typeof resource["name"] === "string" ? resource["name"].trim() : "";
			const url = typeof resource["url"] === "string" ? resource["url"].trim() : "";
			if (!name || !url) return null;
			return { name, url };
		})
		.filter((item): item is AnimeResourceLink => item !== null);
}

function toAnimeExchangeItem(raw: Record<string, unknown>): AnimeExchangeItem | null {
	const offeredValue = raw["anime"];
	const offered = Array.isArray(offeredValue) ? offeredValue[0] : offeredValue;

	if (!offered || typeof offered !== "object") return null;
	const offeredRecord = offered as Record<string, unknown>;
	const rawStatus = raw["status"];
	const status =
		rawStatus === "waiting" || rawStatus === "matched" || rawStatus === "cancelled" ? rawStatus : "waiting";

	return {
		id: String(raw["id"]),
		status,
		created_at: String(raw["created_at"]),
		matched_at: (raw["matched_at"] as string | null) ?? null,
		comment: typeof raw["comment"] === "string" ? raw["comment"] : null,
		offered_anime: {
			id: String(offeredRecord["id"]),
			title: String(offeredRecord["title"]),
			title_en: typeof offeredRecord["title_en"] === "string" ? offeredRecord["title_en"] : null,
			cover_url: typeof offeredRecord["cover_url"] === "string" ? offeredRecord["cover_url"] : null,
		},
		received_anime: null,
		received_comment: null,
	};
}

async function fetchAnimesByIds(supabase: SupabaseClient<Database>, ids: string[]): Promise<Anime[]> {
	if (ids.length === 0) return [];
	const { data, error } = await supabase
		.from("anime_with_computed_broadcast_status")
		.select(ANIME_LIST_COLUMNS)
		.in("id", ids.map(Number));
	const rows =
		error || !data
			? (await supabase.from("anime").select(ANIME_LIST_BASE_COLUMNS).in("id", ids.map(Number))).data
			: data;
	if (!rows) return [];
	const map = new Map((rows as unknown as Record<string, unknown>[]).map((a) => [String(a["id"]), toAnime(a)]));
	return ids.map((id) => map.get(id)).filter((a): a is Anime => a !== undefined);
}

async function enrichAnimeWithUserEntries(
	supabase: SupabaseClient<Database>,
	animes: Anime[],
	userId: string,
): Promise<Anime[]> {
	const animeIds = animes.map((a) => a.id);
	const { data } = await supabase
		.from("user_anime_list")
		.select("anime_id, status, score, progress, updated_at")
		.eq("user_id", userId)
		.in("anime_id", animeIds.map(Number));

	const entryMap = new Map(
		(data ?? []).map((e) => [
			Number(e.anime_id),
			{
				status: e.status as AnimeStatus,
				score: e.score as number | null,
				progress: e.progress,
				updated_at: e.updated_at,
			} satisfies UserAnimeEntry,
		]),
	);

	return animes.map((a) => ({ ...a, user_entry: entryMap.get(Number(a.id)) ?? null }));
}

function toBroadcastStatus(raw: Record<string, unknown>): BroadcastStatus {
	const computed = raw["computed_broadcast_status"];
	if (computed === "airing" || computed === "finished" || computed === "upcoming" || computed === "unknown") {
		return computed;
	}

	const today = new Date();
	const jstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
	const airedFrom = typeof raw["aired_from"] === "string" ? raw["aired_from"].slice(0, 10) : null;
	const airedTo = typeof raw["aired_to"] === "string" ? raw["aired_to"].slice(0, 10) : null;
	const rawType = typeof raw["type"] === "string" ? raw["type"] : null;
	const normalizedType = rawType?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
	const isFiniteReleaseType = ["movie", "ona", "ova", "tvspecial", "special"].includes(normalizedType);

	if (airedFrom && airedFrom > jstToday) return "upcoming";
	if (airedTo && airedTo < jstToday) return "finished";
	if (airedFrom && airedFrom <= jstToday && !airedTo && isFiniteReleaseType) return "finished";
	if (airedFrom && airedFrom <= jstToday && (!airedTo || airedTo >= jstToday)) return "airing";
	return "unknown";
}

export async function getBroadcastSubscriptions(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
	const { data } = await supabase
		.from("broadcast_notification_subscriptions")
		.select("anime_id")
		.eq("user_id", userId);
	return (data ?? []).map((row) => String(row.anime_id));
}

export async function getBroadcastNotificationSettings(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<import("$lib/types").BroadcastNotificationSettings> {
	const { data } = await supabase
		.from("broadcast_notification_settings")
		.select("notify_1min, notify_5min, notify_30min")
		.eq("user_id", userId)
		.maybeSingle();
	return data ?? { notify_1min: true, notify_5min: true, notify_30min: false };
}

export async function getBroadcastRoomSession(
	supabase: SupabaseClient<Database>,
	animeId: string,
	roomDate: string,
): Promise<BroadcastRoomSession | null> {
	const { data, error } = await supabase.rpc("ensure_broadcast_room_session", {
		p_anime_id: Number(animeId),
		p_room_date: roomDate,
	});
	if (error) {
		console.error("broadcast room session query failed:", error);
		return null;
	}
	return (data?.[0] as BroadcastRoomSession | undefined) ?? null;
}

export async function getBroadcastRoomMutes(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<BroadcastRoomMute[]> {
	type BroadcastRoomMuteRow = {
		anime_id: number;
		room_session_id: string;
		session: { room_date: string } | { room_date: string }[];
		duration_days: number | null;
		mute_until_event_end: boolean;
		repeat_weekly: boolean;
		muted_until: string;
		created_at: string;
		updated_at: string;
	};

	const { data } = await supabase
		.from("broadcast_room_mutes")
		.select(
			"anime_id, room_session_id, session:broadcast_room_sessions!broadcast_room_mutes_room_session_id_fkey ( room_date ), duration_days, mute_until_event_end, repeat_weekly, muted_until, created_at, updated_at",
		)
		.eq("user_id", userId)
		.order("muted_until", { ascending: false });
	const rows = (data ?? []) as unknown as BroadcastRoomMuteRow[];
	if (rows.length === 0) return [];

	const { data: animes } = await supabase
		.from("anime")
		.select("id, title, cover_url")
		.in(
			"id",
			rows.map((row) => row.anime_id),
		);
	const animeById = new Map((animes ?? []).map((anime) => [anime.id, anime]));

	return rows.map((row) => {
		const anime = animeById.get(row.anime_id);
		const duration =
			row.mute_until_event_end || row.duration_days == null
				? "event_end"
				: (Math.min(7, Math.max(1, row.duration_days)) as 1 | 2 | 3 | 4 | 5 | 6 | 7);
		return {
			anime_id: String(row.anime_id),
			anime_title: anime?.title ?? "不明なアニメ",
			anime_cover_url: anime?.cover_url ?? null,
			room_session_id: row.room_session_id,
			room_date: (Array.isArray(row.session) ? row.session[0]?.room_date : row.session?.room_date) ?? "",
			duration,
			repeat_weekly: row.repeat_weekly,
			muted_until: row.muted_until,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	});
}
