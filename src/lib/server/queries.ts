import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import type {
	Anime,
	AnimeExchangeItem,
	AnimeExchangeShare,
	AnimeStatus,
	Event,
	Notification,
	Post,
	RawPost,
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

type NotificationRow = {
	id: string;
	type: string;
	post_id: string | null;
	anime_recommendation_id: string | null;
	read: boolean;
	created_at: string;
	actor: NotificationActor | NotificationActor[] | null;
	post: NotificationPost | NotificationPost[] | null;
	recommendation: NotificationRecommendation | NotificationRecommendation[] | null;
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
	anime: Record<string, unknown>;
};
type UserAnimeListWithProfileRow = {
	user_id: string;
	status: AnimeStatus;
	score: number | null;
	progress: number;
	profiles: { username: string; display_name: string | null; avatar_url: string | null; list_is_public: boolean };
};

/**
 * rawPost 配列に like_count / repost_count / reply_count / liked_by_me / reposted_by_me を付加して
 * Post[] に変換する共通ヘルパー。
 * 全ルートサーバー（タイムライン・プロフィール・ハッシュタグ・検索・詳細）で使い回す。
 */
export async function enrichPostsWithCounts(
	supabase: SupabaseClient<Database>,
	rawPosts: RawPost[],
	userId: string | null,
): Promise<Post[]> {
	if (rawPosts.length === 0) return [];

	const mutedWordsPromise = getMutedWords(supabase, userId);

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

	const mutedWords = await mutedWordsPromise;
	const visibleRawPosts =
		mutedWords.length > 0 ? rawPosts.filter((post) => !containsMutedWord(post, mutedWords)) : rawPosts;

	if (visibleRawPosts.length === 0) return [];

	const postIds = visibleRawPosts.map((p) => p.id as string);

	// ── 並列バッチクエリ ──────────────────────────────────────────
	const [likesRes, repostsRes, repliesRes, myLikesRes, myRepostsRes, myBookmarksRes] = await Promise.all([
		// 各投稿のいいね数（post_id ごとにカウント）
		supabase.from("likes").select("post_id").in("post_id", postIds),

		// 各投稿のリポスト数
		supabase.from("reposts").select("post_id").in("post_id", postIds),

		// 各投稿のリプライ数（parent_id が投稿IDに一致するもの）
		supabase.from("posts").select("parent_id").in("parent_id", postIds),

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

	// ── JS でカウント集計 ─────────────────────────────────────────
	const likeCount = countByPostId(likesRes.data ?? []);
	const repostCount = countByPostId(repostsRes.data ?? []);
	const replyCount = countByPostId((repliesRes.data ?? []).map((r) => ({ post_id: r.parent_id as string })));

	const likedSet = new Set((myLikesRes.data ?? []).map((r) => r.post_id));
	const repostedSet = new Set((myRepostsRes.data ?? []).map((r) => r.post_id));
	const bookmarkedSet = new Set((myBookmarksRes.data ?? []).map((r) => r.post_id));

	// ── アニメ引用がある投稿のスコアを一括取得 ────────────────────
	const animeIds = [
		...new Set(visibleRawPosts.map((p) => p.anime_id).filter((id): id is string | number => id != null)),
	];
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
			like_count: likeCount.get(raw["id"]) ?? 0,
			repost_count: repostCount.get(raw["id"]) ?? 0,
			reply_count: replyCount.get(raw["id"]) ?? 0,
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

function countByPostId(rows: { post_id: string }[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const row of rows) {
		map.set(row.post_id, (map.get(row.post_id) ?? 0) + 1);
	}
	return map;
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
		return {
			id: row["id"],
			type: row.type as Notification["type"],
			post_id: row.post_id,
			anime_recommendation_id: row.anime_recommendation_id,
			read: row.read,
			created_at: row.created_at,
			actor_username: actor?.username ?? "unknown",
			actor_display_name: actor?.display_name ?? null,
			actor_avatar_url: actor?.avatar_url ?? null,
			post_content: post?.content ?? "",
			recommendation_anime_id: recommendation?.anime_id != null ? String(recommendation.anime_id) : null,
			recommendation_anime_title: recommendation?.anime?.title ?? null,
			recommendation_anime_cover_url: recommendation?.anime?.cover_url ?? null,
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
            id, creator_id, title, description, hashtag,
            scheduled_at, duration_minutes, is_cancelled, created_at,
            profiles!events_creator_id_fkey ( username, display_name, avatar_url )
        `)
		.gte("scheduled_at", startOfMonth)
		.lte("scheduled_at", endOfMonth)
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
            id, creator_id, title, description, hashtag,
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
            id, creator_id, title, description, hashtag,
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
): Promise<Post[]> {
	// ハッシュタグ ID を取得
	const { data: hashtagRow } = await supabase
		.from("hashtags")
		.select("id")
		.eq("name", hashtag.toLowerCase())
		.maybeSingle();

	if (!hashtagRow) return [];

	// そのハッシュタグを持つ post_id を取得
	const { data: links } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", hashtagRow["id"]);

	const postIds = (links ?? []).map((l) => l.post_id);
	if (postIds.length === 0) return [];

	const { data: rawPosts } = await supabase
		.from("posts")
		.select(
			`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
		)
		.in("id", postIds)
		.is("parent_id", null) // トップレベル投稿のみ
		.order("created_at", { ascending: false })
		.limit(limit);

	return enrichPostsWithCounts(supabase, rawPosts ?? [], userId);
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
	recentReports: AdminReport[];
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
		recentReports,
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
		supabase
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
			.order("created_at", { ascending: false })
			.limit(25),
	]);

	const reasonMap = new Map<ReportReason, number>();
	for (const row of reasonRows.data ?? []) {
		const reason = row.reason as ReportReason;
		reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
	}

	const recentRows = (recentReports.data ?? []) as unknown as AdminReportRow[];
	const postIds = recentRows.filter((row) => row.target_type === "post").map((row) => row.target_id);
	const targetUserIds = recentRows.map((row) => row.target_user_id).filter((id): id is string => id !== null);
	const postContentById = new Map<string, string>();
	if (postIds.length > 0) {
		const { data: posts } = await supabase.from("posts").select("id, content").in("id", postIds);
		for (const post of posts ?? []) {
			postContentById.set(post.id, post.content);
		}
	}
	const moderationByUserId = new Map<
		string,
		{ status: ModerationStatus; restricted_until: string | null; reason: string | null }
	>();
	if (targetUserIds.length > 0) {
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
		recentReports: recentRows.map((row) =>
			toAdminReport(
				row,
				postContentById.get(row.target_id) ?? null,
				row.target_user_id ? (moderationByUserId.get(row.target_user_id) ?? null) : null,
			),
		),
	};
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
			`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
		)
		.in("id", postIds);
	// ブックマーク保存順を維持するため postIds の順序に並べ直す
	const orderMap = new Map(postIds.map((id, i) => [id, i]));
	const sorted = (rawPosts ?? []).sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
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
			`id, content, created_at, user_id, parent_id, quoted_post_id, image_urls, anime_id, exchange_share,
             profiles!posts_user_id_fkey ( username, display_name, avatar_url ),
             post_hashtags ( hashtags ( name ) ),
             anime:anime!posts_anime_id_fkey ( id, title, cover_url )`,
		)
		.in("id", postIds)
		.order("created_at", { ascending: false });
	return enrichPostsWithCounts(supabase, rawPosts ?? [], currentUserId);
}

// ================================================================
// アニメ クエリ
// ================================================================

export interface AnimeListOptions {
	season?: string;
	genre?: string;
	studio?: string;
	producer?: string;
	status?: "airing" | "finished" | "upcoming";
	limit?: number;
	userId?: string | null;
	query?: string;
}

/**
 * アニメ一覧を取得する（season / status フィルター対応）
 */
export async function getAnimeList(
	supabase: SupabaseClient<Database>,
	options: AnimeListOptions = {},
): Promise<Anime[]> {
	const { season, genre, studio, producer, status, limit = 20, userId, query: searchQuery } = options;

	let query = supabase.from("anime").select("*").order("created_at", { ascending: false }).limit(limit);

	if (season) query = query.eq("season", season);
	if (genre) query = query.contains("genre", [genre]);
	if (studio) query = query.contains("studio", [studio]);
	if (producer) query = query.contains("producer", [producer]);
	if (status) query = query.eq("status", status);
	if (searchQuery) query = query.or(`title.ilike.%${searchQuery}%,title_en.ilike.%${searchQuery}%`);

	const { data, error } = await query;
	if (error || !data) return [];

	const animes: Anime[] = (data as Record<string, unknown>[]).map(toAnime);
	if (userId) return enrichAnimeWithUserEntries(supabase, animes, userId);
	return animes;
}

/**
 * アニメ詳細を取得する（全集計フィールド + ログインユーザーのエントリ付き）
 */
export async function getAnime(
	supabase: SupabaseClient<Database>,
	animeId: string,
	userId?: string | null,
): Promise<Anime | null> {
	const { data, error } = await supabase.from("anime").select("*").eq("id", Number(animeId)).maybeSingle();

	if (error || !data) return null;

	const anime = toAnime(data as Record<string, unknown>);

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

/**
 * 人気ランキング（総マイリスト登録数順）
 */
export async function getAnimeRankingPopularity(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const { data, error } = await supabase.from("user_anime_list").select("anime_id");
	if (error || !data || data.length === 0) return [];

	const countMap = new Map<string, number>();
	for (const row of data) {
		const animeId = String(row.anime_id);
		countMap.set(animeId, (countMap.get(animeId) ?? 0) + 1);
	}

	const rankedIds = [...countMap.entries()]
		.sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return Number(a[0]) - Number(b[0]);
		})
		.slice(0, limit)
		.map(([animeId]) => animeId);

	if (rankedIds.length === 0) return [];
	const animes = await fetchAnimesByIds(supabase, rankedIds);
	return animes.map((a) => ({ ...a, list_count: countMap.get(a.id) ?? 0 }));
}

/**
 * トレンドランキング（直近7日間のアクティビティ順）
 */
export async function getAnimeRankingTrending(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const { data, error } = await supabase.from("user_anime_list").select("anime_id").gte("updated_at", since);
	if (error || !data || data.length === 0) return [];

	const countMap = new Map<string, number>();
	for (const row of data) {
		const animeId = String(row.anime_id);
		countMap.set(animeId, (countMap.get(animeId) ?? 0) + 1);
	}

	const rankedIds = [...countMap.entries()]
		.sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return Number(a[0]) - Number(b[0]);
		})
		.slice(0, limit)
		.map(([animeId]) => animeId);

	if (rankedIds.length === 0) return [];
	const animes = await fetchAnimesByIds(supabase, rankedIds);
	return animes.map((a) => ({ ...a, recent_count: countMap.get(a.id) ?? 0 }));
}

/**
 * 高評価ランキング（平均スコア順）
 */
export async function getAnimeRankingTopRated(supabase: SupabaseClient<Database>, limit = 20): Promise<Anime[]> {
	const { data, error } = await supabase.from("user_anime_list").select("anime_id, score").not("score", "is", null);
	if (error || !data || data.length === 0) return [];

	const totals = new Map<string, { sum: number; count: number }>();
	for (const row of data) {
		if (row.score == null) continue;
		const animeId = String(row.anime_id);
		const current = totals.get(animeId) ?? { sum: 0, count: 0 };
		current.sum += Number(row.score);
		current.count += 1;
		totals.set(animeId, current);
	}
	if (totals.size === 0) return [];

	const ranked = [...totals.entries()]
		.map(([animeId, v]) => ({ anime_id: animeId, avg_score: v.sum / v.count, score_count: v.count }))
		.sort((a, b) => {
			if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
			if (b.score_count !== a.score_count) return b.score_count - a.score_count;
			return Number(a.anime_id) - Number(b.anime_id);
		})
		.slice(0, limit);

	const avgMap = new Map(ranked.map((r) => [r.anime_id, r.avg_score]));
	const cntMap = new Map(ranked.map((r) => [r.anime_id, r.score_count]));
	const animes = await fetchAnimesByIds(
		supabase,
		ranked.map((r) => r.anime_id),
	);
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
		.select("status, score, progress, updated_at, anime:anime_id(*)")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false });

	if (status) query = query.eq("status", status);

	const { data, error } = await query;
	if (error || !data) return [];

	return (data as UserAnimeListWithAnimeRow[]).map((row) => ({
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
			anime:anime_exchange_entries_anime_id_fkey (
				id,
				title,
				title_en,
				cover_url
			)
		`)
		.in("id", receivedEntryIds);

	if (receivedError || !receivedRows) return baseItems;

	const receivedAnimeByEntryId = new Map<string, AnimeExchangeItem["received_anime"]>();
	for (const row of receivedRows as Record<string, unknown>[]) {
		const animeValue = row["anime"];
		const anime = Array.isArray(animeValue) ? animeValue[0] : animeValue;
		if (!anime || typeof anime !== "object" || !row["id"]) continue;
		const animeRecord = anime as Record<string, unknown>;
		receivedAnimeByEntryId.set(String(row["id"]), {
			id: String(animeRecord["id"]),
			title: String(animeRecord["title"]),
			title_en: typeof animeRecord["title_en"] === "string" ? animeRecord["title_en"] : null,
			cover_url: typeof animeRecord["cover_url"] === "string" ? animeRecord["cover_url"] : null,
		});
	}

	return baseItems.map((item, index) => {
		const receivedEntryId = baseRows[index]?.["received_entry_id"];
		const receivedAnime =
			typeof receivedEntryId === "string" && receivedEntryId.length > 0
				? (receivedAnimeByEntryId.get(receivedEntryId) ?? null)
				: null;
		return { ...item, received_anime: receivedAnime };
	});
}

// ── ヘルパー ──────────────────────────────────────────────────────

export async function getAnimeExchangeShareForUser(
	supabase: SupabaseClient<Database>,
	userId: string,
	exchangeId: string,
): Promise<AnimeExchangeShare | null> {
	const entries = await getAnimeExchangeEntries(supabase, userId, 50);
	const exchange = entries.find((entry) => entry.id === exchangeId && entry.received_anime);
	if (!exchange?.received_anime) return null;

	return {
		type: "anime_exchange",
		offered_anime: exchange.offered_anime,
		received_anime: exchange.received_anime,
	};
}

function toAnime(raw: Record<string, unknown>): Anime {
	return {
		id: String(raw["id"]),
		title: String(raw["title"]),
		title_en: (raw["title_en"] as string | null) ?? null,
		title_romaji: (raw["title_romaji"] as string | null) ?? null,
		synopsis: (raw["synopsis"] as string | null) ?? null,
		cover_url: (raw["cover_url"] as string | null) ?? null,
		season: (raw["season"] as string | null) ?? null,
		episode_count: (raw["episode_count"] as number | null) ?? null,
		type: (raw["type"] as string | null) ?? null,
		status: (raw["status"] as string | null) ?? null,
		aired_from: (raw["aired_from"] as string | null) ?? null,
		aired_to: (raw["aired_to"] as string | null) ?? null,
		source: (raw["source"] as string | null) ?? null,
		studio: (raw["studio"] as string[] | null) ?? null,
		producer: (raw["producer"] as string[] | null) ?? null,
		genre: (raw["genre"] as string[] | null) ?? null,
		official_site_url: (raw["official_site_url"] as string | null) ?? null,
		official_x_url: (raw["official_x_url"] as string | null) ?? null,
		official_hashtag: (raw["official_hashtag"] as string[] | null) ?? null,
		copyright: (raw["copyright"] as string | null) ?? null,
		created_at: String(raw["created_at"]),
	};
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
		offered_anime: {
			id: String(offeredRecord["id"]),
			title: String(offeredRecord["title"]),
			title_en: typeof offeredRecord["title_en"] === "string" ? offeredRecord["title_en"] : null,
			cover_url: typeof offeredRecord["cover_url"] === "string" ? offeredRecord["cover_url"] : null,
		},
		received_anime: null,
	};
}

async function fetchAnimesByIds(supabase: SupabaseClient<Database>, ids: string[]): Promise<Anime[]> {
	if (ids.length === 0) return [];
	const { data } = await supabase.from("anime").select("*").in("id", ids.map(Number));
	if (!data) return [];
	const map = new Map((data as Record<string, unknown>[]).map((a) => [String(a["id"]), toAnime(a)]));
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
