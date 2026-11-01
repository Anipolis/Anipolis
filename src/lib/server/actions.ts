import type { SupabaseClient } from "@supabase/supabase-js";
import { error, fail } from "@sveltejs/kit";
import { computeMutedUntil } from "$lib/anime-mute-schedule";
import {
	MAX_EXCHANGE_SUBJECTIVE_TAGS,
	toExchangeSubjectiveTags,
	validateExchangeSubjectiveTags,
} from "$lib/exchange-tags";
import { parseMylistNote, parseWatchDates } from "$lib/mylist/entry-details";
import { normalizePostContent } from "$lib/post-content";
import { isPostImageUsable } from "$lib/post-image-lifetime";
import { ownedPostImagePath } from "$lib/post-image-url";
import { fetchOAuthAvatar } from "$lib/server/oauth-avatar";
import { getEvent, isAdminUser, USERNAME_HELD_ERROR_MESSAGE, USERNAME_HELD_USER_MESSAGE } from "$lib/server/queries";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import { MULTIPART_OVERHEAD_BYTES, readFormDataWithLimit, validateImageBuffer } from "$lib/server/upload";
import type { Database, Json } from "$lib/supabase/database.types";
import type { AnimeExchangeShare, AnimeStatus, BroadcastRoomMuteDuration, UserAnimeEntry } from "$lib/types";
import { eventScheduledAtIsoFromBroadcastInput } from "$lib/utils/event-time";
import { extractHashtags } from "$lib/utils/hashtag";
import { jstDateKey } from "$lib/utils/jst";
import { MIN_PASSWORD_LENGTH } from "$lib/utils/password-reset";

const MAX_POST_IMAGES = 4;
/** 147 のトリガーが投稿の回数制限で返す SQLSTATE（PostgREST は HTTP 429 にする） */
export const POST_RATE_LIMIT_ERROR_CODE = "PT429";
/** 投稿の DB の検査で拒否されたときの SQLSTATE（invalid_parameter_value）。HINT が利用者向けの文言 */
export const POST_REJECTED_ERROR_CODE = "22023";
export const POST_RATE_LIMIT_MESSAGE = "投稿が多すぎます。1分ほど待ってから、もう一度投稿してください";
const reportStatuses = new Set(["open", "reviewing", "resolved", "rejected"]);
const moderationStatuses = new Set(["active", "restricted", "banned"]);
const animeExchangeErrorMessages = {
	ANIME_EXCHANGE_ANIME_NOT_FOUND: { status: 404, message: "アニメが見つかりません" },
	// migration 130: RPC 側でβ参加とアカウント状態を検査する（画面の action を迂回された場合の防衛線）
	ANIME_EXCHANGE_FORBIDDEN: { status: 403, message: "アニメトレードはクローズドβの参加者のみ利用できます" },
	ANIME_EXCHANGE_ACCOUNT_RESTRICTED: {
		status: 403,
		message: "このアカウントは制限中のためアニメトレードを開始できません",
	},
	ANIME_EXCHANGE_WAITING_EXISTS: {
		status: 409,
		message: "待機中のトレードがあります。マッチングをやめてからもう一度お試しください。",
	},
} as const;

export type ModerationStatus = "active" | "restricted" | "banned";

type ModerationProfile = {
	moderation_status: ModerationStatus;
	moderation_until: string | null;
};

type RoomLinkTrendAnime = {
	title: string | null;
	official_hashtag: string[] | null;
};

type RoomLinkTrendSession = {
	anime: RoomLinkTrendAnime | RoomLinkTrendAnime[] | null;
};

type EventLinkTrendRow = {
	hashtag: string | null;
};

function fallbackRoomHashtag(title: string) {
	return title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

function normalizeHashtagMetadata(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

function firstRelatedRow<T>(value: T | T[] | null | undefined): T | null {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function getRoomLinkTrendHashtag(
	supabase: SupabaseClient<Database>,
	broadcastRoomSessionId: string | null,
): Promise<string | null> {
	if (!broadcastRoomSessionId) return null;

	const { data, error } = await supabase
		.from("broadcast_room_sessions")
		.select("anime:anime!broadcast_room_sessions_anime_id_fkey ( title, official_hashtag )")
		.eq("id", broadcastRoomSessionId)
		.maybeSingle();

	if (error || !data) {
		if (error) console.error("room link trend hashtag lookup error:", error);
		return null;
	}

	const anime = firstRelatedRow((data as unknown as RoomLinkTrendSession).anime);
	if (!anime) return null;

	const officialHashtag = anime.official_hashtag?.map(normalizeHashtagMetadata).find((tag) => tag.length > 0);
	if (officialHashtag) return officialHashtag;

	const fallback = fallbackRoomHashtag(anime.title ?? "");
	return fallback ? normalizeHashtagMetadata(fallback) : null;
}

async function getEventLinkTrendHashtag(
	supabase: SupabaseClient<Database>,
	eventId: string | null,
): Promise<string | null> {
	if (!eventId) return null;

	const { data, error } = await supabase.from("events").select("hashtag").eq("id", eventId).maybeSingle();
	if (error || !data) {
		if (error) console.error("event room link trend hashtag lookup error:", error);
		return null;
	}

	const tag = normalizeHashtagMetadata((data as EventLinkTrendRow).hashtag ?? "");
	return tag.length > 0 ? tag : null;
}

export function getAnimeExchangeErrorDetail(error: {
	details?: unknown;
}): keyof typeof animeExchangeErrorMessages | null {
	return typeof error.details === "string" && error.details in animeExchangeErrorMessages
		? (error.details as keyof typeof animeExchangeErrorMessages)
		: null;
}

export async function getCurrentModerationStatus(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<ModerationProfile | null> {
	const { data, error: lookupError } = await supabase
		.from("account_moderation")
		.select("status, restricted_until")
		.eq("user_id", userId)
		.maybeSingle();
	// 照会に失敗したら null を返し、呼び出し側で fail closed にする。
	// active 扱いにすると、Storage ポリシーで拒否されるまで検証やアップロードが進んでしまう。
	if (lookupError) return null;
	const status = (data?.status ?? "active") as ModerationStatus;
	const until = data?.restricted_until ?? null;

	if (status === "restricted" && until && new Date(until).getTime() <= Date.now()) {
		// 期限切れのため DB を非同期更新（管理ダッシュボードの統計に古い制限が混入するのを防ぐ）
		supabase.from("account_moderation").update({ status: "active" }).eq("user_id", userId);
		return { moderation_status: "active", moderation_until: until };
	}

	return { moderation_status: status, moderation_until: until };
}

export async function ensureAccountCanWrite(supabase: SupabaseClient<Database>, userId: string) {
	const profile = await getCurrentModerationStatus(supabase, userId);
	if (!profile) {
		return fail(503, { message: "アカウント状態を確認できません。しばらくしてからお試しください" });
	}
	if (profile.moderation_status === "banned") {
		return fail(403, { message: "このアカウントはBANされています" });
	}
	if (profile.moderation_status === "restricted") {
		return fail(403, {
			message: profile.moderation_until
				? `このアカウントは${new Date(profile.moderation_until).toLocaleString("ja-JP")}まで制限されています`
				: "このアカウントは制限されています",
		});
	}
	return null;
}

/**
 * ブロック関係があれば fail(403) を返す。無ければ null。
 *
 * DB 側（141 のポリシーと can_view_profile_content）でも止まるが、
 * そこで弾かれた場合のメッセージは「できませんでした」になってしまう。
 * 理由の分かる応答を返すために、書き込み前にアプリ側でも確認する。
 */
export async function ensureNotBlocked(
	supabase: SupabaseClient<Database>,
	userId: string,
	targetUserId: string | null | undefined,
) {
	if (!targetUserId || targetUserId === userId) return null;
	const { data, error } = await supabase.rpc("is_blocked_between", {
		user_a: userId,
		user_b: targetUserId,
	});
	if (error) {
		console.error("ensureNotBlocked error:", error);
		return null;
	}
	if (data === true) return fail(403, { message: "ブロックしているユーザー、またはブロックされているユーザーです" });
	return null;
}

export async function blockUserAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const targetId = (form.get("target_id") as string | null)?.trim() ?? "";
	if (!targetId) return fail(400, { message: "ユーザーIDが不正です" });
	if (targetId === userId) return fail(400, { message: "自分自身をブロックできません" });

	const { data: target } = await supabase.from("profiles").select("id").eq("id", targetId).maybeSingle();
	if (!target) return fail(404, { message: "ユーザーが見つかりません" });

	// フォロー・フォロー申請・未読通知の解除は 141 のトリガーが同じトランザクションで行う
	const { error } = await supabase
		.from("user_blocks")
		.upsert(
			{ blocker_id: userId, blocked_id: targetId },
			{ onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
		);
	if (error) {
		console.error("blockUserAction error:", error);
		return fail(403, { message: "ブロックできませんでした" });
	}
	return { blocked: true };
}

export async function unblockUserAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const targetId = (form.get("target_id") as string | null)?.trim() ?? "";
	if (!targetId) return fail(400, { message: "ユーザーIDが不正です" });

	const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", targetId);
	if (error) {
		console.error("unblockUserAction error:", error);
		return fail(500, { message: "ブロック解除に失敗しました" });
	}
	return { blocked: false };
}

/**
 * API ルート（+server.ts）用: 利用制限・BAN中なら error() を投げる。
 * form action 用の ensureAccountCanWrite と同じ判定を、HTTP エラーとして返す。
 */
export async function requireAccountCanWrite(supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) {
		const data = moderationFailure.data as { message?: string };
		error(moderationFailure.status, data.message ?? "このアカウントは制限されています");
	}
}

/**
 * 投稿（＋ハッシュタグ）を挿入する共通ロジック
 * タイムラインの createPost とリプライの reply で使い回す
 */
export async function insertPostWithHashtags(
	supabase: SupabaseClient<Database>,
	userId: string,
	rawContent: string,
	parentId: string | null = null,
	imageUrls: string[] = [],
	animeId: string | null = null,
	quotedPostId: string | null = null,
	exchangeShare: AnimeExchangeShare | null = null,
	broadcastRoomSessionId: string | null = null,
	cwAnimeId: string | null = null,
	additionalHashtags: string[] = [],
	eventId: string | null = null,
	episodeRoomId: string | null = null,
) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	// 表示されない制御文字を取り除いてから「本文あり」を判定する（#245）。制御文字だけの本文は、
	// 作品つきのルームの投稿などでも空の投稿として保存されないよう、本文が無いものとして断る
	const content = normalizePostContent(rawContent);
	if (rawContent.trim() && !content) {
		return fail(400, { message: "本文に表示できる文字がありません" });
	}
	if (!content && imageUrls.length === 0 && !animeId && !exchangeShare) {
		return fail(400, { message: "本文、画像、アニメ引用、またはトレード結果を追加してください" });
	}
	if (content.length > 280) return fail(400, { message: "280文字以内で入力してください" });

	// 画像は自分のフォルダにアップロードされた post-images の URL のみ、最大4枚まで受け付ける
	// （クライアント側の4枚制限・アップロードAPIの検査を直接POSTで迂回されるのを防ぐ）
	if (imageUrls.length > MAX_POST_IMAGES) {
		return fail(400, { message: `画像は${MAX_POST_IMAGES}枚まで添付できます` });
	}
	for (const imageUrl of imageUrls) {
		// デコード後のパスで <自分の id>/<ファイル名> の形かを見る（%2e%2e で他人のフォルダを指させない。#235）
		const storagePath = typeof imageUrl === "string" ? ownedPostImagePath(imageUrl, userId) : null;
		if (!storagePath) {
			return fail(400, { message: "添付画像のURLが不正です" });
		}
		// 投稿していない画像の使用期限（アップロードから7日）。過ぎた画像は回収されうるので受け付けない（#330）
		if (!isPostImageUsable(storagePath)) {
			return fail(400, { message: "添付画像の有効期限が切れました。画像をもう一度添付してください" });
		}
	}

	if (parentId) {
		const { data: parent } = await supabase.from("posts").select("id").eq("id", parentId).maybeSingle();
		if (!parent) return fail(404, { message: "返信先の投稿を表示できません" });
	}

	if (quotedPostId) {
		const { data: quotedPost } = await supabase.from("posts").select("id").eq("id", quotedPostId).maybeSingle();
		if (!quotedPost) return fail(404, { message: "引用元の投稿を表示できません" });
	}

	const postContent = exchangeShare && content.length === 0 ? "アニメトレードの結果を共有しました" : content;
	const basePost = {
		user_id: userId,
		content: postContent,
		parent_id: parentId,
		image_urls: imageUrls,
		anime_id: animeId ? Number(animeId) : null,
		cw_anime_id: cwAnimeId ? Number(cwAnimeId) : null,
		quoted_post_id: quotedPostId || null,
		broadcast_room_session_id: broadcastRoomSessionId,
		event_id: eventId,
		// 話数ルーム（153）。放送枠の時間内なら DB のトリガーが放送枠も補う
		episode_room_id: episodeRoomId,
	};
	const postPayload = exchangeShare ? { ...basePost, exchange_share: exchangeShare as unknown as Json } : basePost;

	const { data: post, error: postError } = await supabase.from("posts").insert(postPayload).select("id").single();

	// 回数制限（147 のトリガー）。経路を問わず DB で数え、PostgREST は SQLSTATE PT429 を返す（#321）。
	// 書きかけを残して再送できるよう、エラーではなく 429 の失敗として返す
	if (postError?.code === POST_RATE_LIMIT_ERROR_CODE) {
		return fail(429, { message: POST_RATE_LIMIT_MESSAGE });
	}
	// DB の検査（167 の画像・171 のイベントルーム）は 22023 で拒否し、HINT に画面に出す文言を入れている
	if (postError?.code === POST_REJECTED_ERROR_CODE) {
		return fail(400, { message: postError.hint || "この内容では投稿できません" });
	}
	if (postError || !post) {
		console.error("post insert error:", postError);
		return fail(500, {
			message: exchangeShare ? "トレード結果つき投稿の保存に失敗しました" : "投稿に失敗しました",
		});
	}

	// ハッシュタグを一括登録（既存タグは ON CONFLICT DO NOTHING）。
	// タグごとの insert+select ループは実況時の余分な往復になるため一括化している。
	// メンション通知は DB トリガー notify_on_mention（migration 026）が生成する。
	const additionalTags = additionalHashtags.map(normalizeHashtagMetadata).filter((tag) => tag.length > 0);
	const roomLinkTrendHashtag =
		additionalTags.length === 0 ? await getRoomLinkTrendHashtag(supabase, broadcastRoomSessionId) : null;
	const eventLinkTrendHashtag =
		additionalTags.length === 0 ? await getEventLinkTrendHashtag(supabase, eventId) : null;
	const roomLinkTags = [roomLinkTrendHashtag, eventLinkTrendHashtag].filter((tag): tag is string => Boolean(tag));
	const tags = [...new Set([...extractHashtags(postContent), ...additionalTags, ...roomLinkTags])];
	if (tags.length > 0) {
		await supabase.from("hashtags").upsert(
			tags.map((name) => ({ name })),
			{ onConflict: "name", ignoreDuplicates: true },
		);
		const { data: hashtagRows } = await supabase.from("hashtags").select("id").in("name", tags);
		if (hashtagRows && hashtagRows.length > 0) {
			await supabase.from("post_hashtags").upsert(
				hashtagRows.map((h) => ({ post_id: post.id, hashtag_id: h.id })),
				{ onConflict: "post_id,hashtag_id", ignoreDuplicates: true },
			);
		}
	}

	return { success: true, postId: post.id };
}

/**
 * 投稿削除 — 自分の投稿のみ削除可（RLS でも保証済み）
 */
export async function deletePostAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";

	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	// 添付画像のクリーンアップ用に削除前へ控える
	const { data: post } = await supabase
		.from("posts")
		.select("image_urls")
		.eq("id", postId)
		.eq("user_id", userId)
		.maybeSingle();

	const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);

	if (error) return fail(500, { message: "削除に失敗しました" });

	await removePostImages(supabase, post?.image_urls ?? [], userId);

	return { deleted: true };
}

/**
 * 投稿に添付されていた画像をストレージから削除する（ベストエフォート）。
 * 消すのは投稿者自身のフォルダの画像だけ（#235）。管理者削除は service role で動くので、
 * 投稿に他人の画像の URL が入っていても、その画像を巻き込んで消さないよう投稿者と照らし合わせる。
 */
async function removePostImages(
	supabase: SupabaseClient<Database>,
	imageUrls: string[],
	ownerId: string,
): Promise<void> {
	const paths = imageUrls
		.map((url) => ownedPostImagePath(url, ownerId))
		.filter((path): path is string => path !== null);
	if (paths.length === 0) return;
	const { error } = await supabase.storage.from("post-images").remove(paths);
	if (error) console.error("post image cleanup error:", error);
}

/**
 * いいねのトグル — 既にいいね済みなら削除、未いいねなら挿入
 */
/**
 * リアクション（いいね・ブックマーク・リポスト）の押した後の状態。"on" / "off" 以外（古いクライアント）は null。
 * 指定があればサーバーは反転ではなくこの状態に合わせる。表示が古い（件数の取得に失敗して未反応と
 * 表示されていた等）まま押しても、意図と逆の操作（解除）にならないようにするため（#383 の Codex レビュー）。
 */
function readReactionIntent(form: FormData): "on" | "off" | null {
	const intent = form.get("intent");
	return intent === "on" || intent === "off" ? intent : null;
}

/**
 * 操作後のいいね数・リポスト数（get_post_counts）。取れなければ undefined（呼び出し側は推測で表示する）。
 * 表示していた件数が取得の失敗で 0 だった投稿でも、押したあとに正しい件数を確定させるため（#388 Codex）。
 */
async function readReactionCount(
	supabase: SupabaseClient<Database>,
	postId: string,
	userId: string,
	column: "like_count" | "repost_count",
): Promise<number | undefined> {
	const { data, error } = await supabase.rpc("get_post_counts", { p_post_ids: [postId], p_user_id: userId });
	if (error) return undefined;
	const value = data?.[0]?.[column];
	return typeof value === "number" ? value : undefined;
}

export async function toggleLikeAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing, error: lookupError } = await supabase
		.from("likes")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();
	// 照会に失敗したら、今の状態が分からないので何もせず失敗を返す（成功扱いにすると表示と実際がずれる）
	if (lookupError) return fail(500, { message: "いいねの状態を確認できませんでした" });

	const intent = readReactionIntent(form);
	if (existing && intent === "on")
		return { liked: true, count: await readReactionCount(supabase, postId, userId, "like_count") };

	// intent=off は照会の結果に関わらず本人の行を消す。投稿が非公開化・ブロック等で見えなくなると
	// 照会（SELECT の RLS）では行が見えないが、DELETE は本人の行を消せるため（#388 Codex）
	if (existing || intent === "off") {
		const { error: deleteError } = await supabase
			.from("likes")
			.delete()
			.eq("post_id", postId)
			.eq("user_id", userId);
		if (deleteError) return fail(500, { message: "いいねの解除に失敗しました" });
		return { liked: false, count: await readReactionCount(supabase, postId, userId, "like_count") };
	}

	const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
	// 一意制約の違反は「見えないが既にいいね済み」。付いている状態として返す
	if (error && error.code !== "23505") return fail(403, { message: "この投稿にいいねできません" });
	return { liked: true, count: await readReactionCount(supabase, postId, userId, "like_count") };
}

/**
 * ブックマークのトグル — 既にブックマーク済みなら削除、未ブックマークなら挿入（intent があればその状態に合わせる）
 */
export async function toggleBookmarkAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing, error: lookupError } = await supabase
		.from("bookmarks")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();
	// 照会に失敗したら、今の状態が分からないので何もせず失敗を返す（成功扱いにすると表示と実際がずれる）
	if (lookupError) return fail(500, { message: "ブックマークの状態を確認できませんでした" });

	const intent = readReactionIntent(form);
	if (existing && intent === "on") return { bookmarked: true };

	// intent=off は照会の結果に関わらず本人の行を消す。投稿が非公開化・ブロック等で見えなくなると
	// 照会（SELECT の RLS）では行が見えないが、DELETE は本人の行を消せるため（#388 Codex）
	if (existing || intent === "off") {
		const { error: deleteError } = await supabase
			.from("bookmarks")
			.delete()
			.eq("post_id", postId)
			.eq("user_id", userId);
		if (deleteError) return fail(500, { message: "ブックマークの解除に失敗しました" });
		return { bookmarked: false };
	}

	const { error } = await supabase.from("bookmarks").insert({ post_id: postId, user_id: userId });
	if (error && error.code !== "23505") return fail(403, { message: "この投稿をブックマークできません" });
	return { bookmarked: true };
}

export async function toggleRepostAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing, error: lookupError } = await supabase
		.from("reposts")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();
	// 照会に失敗したら、今の状態が分からないので何もせず失敗を返す（成功扱いにすると表示と実際がずれる）
	if (lookupError) return fail(500, { message: "リポストの状態を確認できませんでした" });

	const intent = readReactionIntent(form);
	if (existing && intent === "on") {
		return { reposted: true, count: await readReactionCount(supabase, postId, userId, "repost_count") };
	}

	// intent=off は照会の結果に関わらず本人の行を消す。投稿が非公開化・ブロック等で見えなくなると
	// 照会（SELECT の RLS）では行が見えないが、DELETE は本人の行を消せるため（#388 Codex）
	if (existing || intent === "off") {
		const { error: deleteError } = await supabase
			.from("reposts")
			.delete()
			.eq("post_id", postId)
			.eq("user_id", userId);
		if (deleteError) return fail(500, { message: "リポストの解除に失敗しました" });
		return { reposted: false, count: await readReactionCount(supabase, postId, userId, "repost_count") };
	}

	const { error } = await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
	if (error && error.code !== "23505") return fail(403, { message: "この投稿をリポストできません" });
	return { reposted: true, count: await readReactionCount(supabase, postId, userId, "repost_count") };
}

/**
 * 全通知を既読にする
 */
export async function markAllNotificationsRead(supabase: SupabaseClient<Database>, userId: string) {
	await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);
}

export type NotificationCategory = "normal" | "room" | "mylist";

/**
 * 通知タブのカテゴリ単位で既読にする
 * - room   = broadcast
 * - mylist = mylist_status
 * - normal = 上記以外
 */
export async function markCategoryNotificationsRead(
	supabase: SupabaseClient<Database>,
	userId: string,
	category: NotificationCategory,
): Promise<{ error: string | null }> {
	const query = supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);

	const { error } =
		category === "room"
			? await query.eq("type", "broadcast" as never)
			: category === "mylist"
				? await query.eq("type", "mylist_status" as never)
				: await query.not("type", "in", "(broadcast,mylist_status)");
	return { error: error?.message ?? null };
}

export async function updateReportStatusAction(request: Request, supabase: SupabaseClient<Database>, adminId: string) {
	const form = await request.formData();
	const reportId = (form.get("report_id") as string | null)?.trim() ?? "";
	const status = (form.get("status") as string | null)?.trim() ?? "";

	if (!reportId) return fail(400, { message: "通報IDが不正です" });
	if (!reportStatuses.has(status)) return fail(400, { message: "ステータスが不正です" });

	const { data: report } = await supabase.from("reports").select("status").eq("id", reportId).maybeSingle();
	if (!report) return fail(404, { message: "通報が見つかりません" });

	const { error } = await supabase
		.from("reports")
		.update({ status: status as "open" | "reviewing" | "resolved" | "rejected" })
		.eq("id", reportId);
	if (error) return fail(500, { message: "通報ステータスの更新に失敗しました" });

	await supabase.from("admin_audit_logs").insert({
		admin_id: adminId,
		action: "report_status_update",
		target_type: "report",
		target_id: reportId,
		metadata: { from: report.status, to: status },
	});

	return { updated: true };
}

export async function updateAccountModerationAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	adminId: string,
) {
	const form = await request.formData();
	const targetUserId = (form.get("target_user_id") as string | null)?.trim() ?? "";
	const reportId = (form.get("report_id") as string | null)?.trim() || null;
	const status = (form.get("moderation_status") as string | null)?.trim() ?? "";
	const reason = ((form.get("moderation_reason") as string | null)?.trim() || null)?.slice(0, 500) ?? null;
	const untilRaw = (form.get("moderation_until") as string | null)?.trim() ?? "";
	const moderationUntil = status === "restricted" && untilRaw ? new Date(untilRaw).toISOString() : null;

	if (!targetUserId) return fail(400, { message: "対象ユーザーIDが不正です" });
	if (targetUserId === adminId) return fail(400, { message: "自分自身を制限することはできません" });
	if (!moderationStatuses.has(status)) return fail(400, { message: "措置の種類が不正です" });
	if (status === "restricted" && untilRaw && Number.isNaN(new Date(untilRaw).getTime())) {
		return fail(400, { message: "制限期限が不正です" });
	}

	const { data: target } = await supabase
		.from("profiles")
		.select("id, username, is_admin")
		.eq("id", targetUserId)
		.maybeSingle();
	if (!target) return fail(404, { message: "対象ユーザーが見つかりません" });
	if (target.is_admin) return fail(403, { message: "管理者アカウントはこの画面から制限できません" });

	const { data: currentModeration } = await supabase
		.from("account_moderation")
		.select("status, restricted_until")
		.eq("user_id", targetUserId)
		.maybeSingle();

	const payload = {
		user_id: targetUserId,
		status: status as ModerationStatus,
		restricted_until: status === "restricted" ? moderationUntil : null,
		reason: status === "active" ? null : reason,
		moderated_by: status === "active" ? null : adminId,
		moderated_at: status === "active" ? null : new Date().toISOString(),
	};

	const { error } = await supabase.from("account_moderation").upsert(payload, { onConflict: "user_id" });
	if (error) return fail(500, { message: "アカウント措置の更新に失敗しました" });

	await supabase.from("admin_audit_logs").insert({
		admin_id: adminId,
		action: "account_moderation_update",
		target_type: "user",
		target_id: targetUserId,
		metadata: {
			report_id: reportId,
			username: target.username,
			from: {
				status: currentModeration?.status ?? "active",
				until: currentModeration?.restricted_until ?? null,
			},
			to: {
				status,
				until: payload.restricted_until,
				reason: payload.reason,
			},
		},
	});

	if (reportId && status !== "active") {
		await supabase
			.from("reports")
			.update({ status: "resolved" })
			.eq("id", reportId)
			.in("status", ["open", "reviewing"]);
	}

	return { moderated: true };
}

/**
 * 管理者による投稿削除（投稿者以外の投稿も削除可）
 */
export async function adminDeletePostAction(request: Request, supabase: SupabaseClient<Database>, adminId: string) {
	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	const reportId = (form.get("report_id") as string | null)?.trim() || null;

	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	// 添付画像のクリーンアップ用に削除前へ控える
	const { data: post } = await supabase.from("posts").select("image_urls, user_id").eq("id", postId).maybeSingle();

	const { error } = await supabase.from("posts").delete().eq("id", postId);
	if (error) return fail(500, { message: "投稿の削除に失敗しました" });

	// 他ユーザーのフォルダはストレージ RLS で消せないため service role で削除する
	if (post) await removePostImages(createServiceRoleClient(), post.image_urls ?? [], post.user_id);

	await supabase.from("admin_audit_logs").insert({
		admin_id: adminId,
		action: "post_delete",
		target_type: "post",
		target_id: postId,
		metadata: { report_id: reportId },
	});

	if (reportId) {
		await supabase
			.from("reports")
			.update({ status: "resolved" })
			.eq("id", reportId)
			.in("status", ["open", "reviewing"]);
	}

	return { deleted: true };
}

/**
 * 管理者による投稿の表示/非表示切り替え
 */
export async function adminTogglePostVisibilityAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	adminId: string,
) {
	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	const reportId = (form.get("report_id") as string | null)?.trim() || null;
	const hide = form.get("hide") === "1";

	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { error } = await supabase.from("posts").update({ hidden_by_admin: hide }).eq("id", postId);
	if (error) return fail(500, { message: "投稿の表示状態の変更に失敗しました" });

	await supabase.from("admin_audit_logs").insert({
		admin_id: adminId,
		action: hide ? "post_hide" : "post_unhide",
		target_type: "post",
		target_id: postId,
		metadata: { report_id: reportId },
	});

	if (reportId && hide) {
		await supabase
			.from("reports")
			.update({ status: "resolved" })
			.eq("id", reportId)
			.in("status", ["open", "reviewing"]);
	}

	return { hidden: hide };
}

// ================================================================
// イベント視聴ルーム アクション
// ================================================================

/**
 * 新しいイベントを作成する
 */
type ParsedEventForm = {
	title: string;
	description: string | null;
	hashtag: string;
	scheduledAtIso: string;
	durationMinutes: number | null;
	animeId: number | null;
};

/**
 * イベント作成・編集フォームの共通バリデーション。
 * createEventAction / updateEventAction の両方から使い、制約を一元管理する。
 */
async function parseEventForm(
	form: FormData,
	supabase: SupabaseClient<Database>,
): Promise<{ ok: true; value: ParsedEventForm } | { ok: false; failure: ReturnType<typeof fail> }> {
	const title = (form.get("title") as string | null)?.trim() ?? "";
	const description = (form.get("description") as string | null)?.trim() || null;
	const rawHashtag = (form.get("hashtag") as string | null)?.trim() ?? "";
	const scheduledAtRaw = (form.get("scheduled_at") as string | null)?.trim() ?? "";
	const scheduledDateRaw = (form.get("scheduled_date") as string | null)?.trim() ?? "";
	const scheduledTimeRaw = (form.get("scheduled_time") as string | null)?.trim() ?? "";
	const durationRaw = (form.get("duration_minutes") as string | null)?.trim() ?? "";
	const animeIdRaw = (form.get("anime_id") as string | null)?.trim() ?? "";
	const animeId = animeIdRaw ? parsePositiveInt(animeIdRaw) : null;
	if (animeIdRaw && animeId === null) {
		return { ok: false, failure: fail(400, { message: "アニメIDの形式が正しくありません" }) };
	}

	if (!title) return { ok: false, failure: fail(400, { message: "タイトルを入力してください" }) };
	if (title.length > 100) {
		return { ok: false, failure: fail(400, { message: "タイトルは100文字以内で入力してください" }) };
	}

	const hashtag = rawHashtag.replace(/^#/, "").toLowerCase();
	if (!hashtag) return { ok: false, failure: fail(400, { message: "ルームリンクを入力してください" }) };
	if (hashtag.length > 50) {
		return { ok: false, failure: fail(400, { message: "ルームリンクは50文字以内で入力してください" }) };
	}
	// 英数・アンダースコア・ひらがな・カタカナ(長音符含む)・漢字・全角英数・半角カナのみ許可。
	// 全角スペースや全角記号(旧レンジ 　 / ＀-／ 等)はタグとして不正なため弾く。
	if (!/^[a-z0-9_ぁ-ゖァ-ヺー一-鿿０-９Ａ-Ｚａ-ｚｦ-ﾟ]+$/u.test(hashtag)) {
		return { ok: false, failure: fail(400, { message: "ルームリンクに使用できない文字が含まれています" }) };
	}

	let scheduledAtIso: string | null = null;
	if (scheduledDateRaw || scheduledTimeRaw) {
		if (!scheduledDateRaw || !scheduledTimeRaw) {
			return { ok: false, failure: fail(400, { message: "開始日と開始時刻を入力してください" }) };
		}
		scheduledAtIso = eventScheduledAtIsoFromBroadcastInput(scheduledDateRaw, scheduledTimeRaw);
		if (!scheduledAtIso) {
			return { ok: false, failure: fail(400, { message: "開始時刻は 00:00〜27:59 の形式で入力してください" }) };
		}
	}
	if (!scheduledAtIso) {
		if (!scheduledAtRaw) return { ok: false, failure: fail(400, { message: "開始日時を入力してください" }) };
		// datetime-local はタイムゾーンなしの文字列で届く。サーバーのTZ(本番はUTC)で解釈すると
		// 9時間ずれるため、オフセットが付いていない場合は JST として明示的にパースする。
		const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAtRaw);
		const scheduledAt = new Date(hasOffset ? scheduledAtRaw : `${scheduledAtRaw}+09:00`);
		if (Number.isNaN(scheduledAt.getTime())) {
			return { ok: false, failure: fail(400, { message: "開始日時の形式が正しくありません" }) };
		}
		scheduledAtIso = scheduledAt.toISOString();
	}
	if (!scheduledAtIso) return { ok: false, failure: fail(400, { message: "開始日時を入力してください" }) };

	const durationMinutes = durationRaw ? parsePositiveInt(durationRaw) : null;
	if (durationRaw && durationMinutes === null) {
		return { ok: false, failure: fail(400, { message: "配信時間は正の整数で入力してください" }) };
	}

	if (animeId !== null) {
		const { data: anime, error: animeError } = await supabase
			.from("anime")
			.select("id")
			.eq("id", animeId)
			.maybeSingle();
		if (animeError) {
			console.error("anime lookup error:", animeError);
			return { ok: false, failure: fail(500, { message: "アニメの確認に失敗しました" }) };
		}
		if (!anime) return { ok: false, failure: fail(400, { message: "アニメが見つかりません" }) };
	}

	return {
		ok: true,
		value: { title, description, hashtag, scheduledAtIso, durationMinutes, animeId },
	};
}

export async function createEventAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const parsed = await parseEventForm(form, supabase);
	if (!parsed.ok) return parsed.failure;
	const { title, description, hashtag, scheduledAtIso, durationMinutes, animeId } = parsed.value;

	const { data: event, error } = await supabase
		.from("events")
		.insert({
			creator_id: userId,
			title,
			description,
			hashtag,
			anime_id: animeId,
			scheduled_at: scheduledAtIso,
			duration_minutes: durationMinutes,
		})
		.select("id")
		.single();

	if (error || !event) {
		console.error("event create error:", error);
		return fail(500, { message: "イベントの作成に失敗しました" });
	}

	return { success: true, eventId: event.id };
}

/**
 * イベントを更新する（管理者のみ — イベント作成自体が管理者限定のため権限も管理者に統一）
 */
export async function updateEventAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
	if (!eventId) return fail(400, { message: "イベントIDが不正です" });
	if (!(await isAdminUser(supabase, userId))) return fail(403, { message: "管理者権限が必要です" });

	const event = await getEvent(supabase, eventId);
	if (!event) return fail(404, { message: "イベントが見つかりません" });

	const parsed = await parseEventForm(form, supabase);
	if (!parsed.ok) return parsed.failure;
	const { title, description, hashtag, scheduledAtIso, durationMinutes, animeId } = parsed.value;

	const { error } = await supabase
		.from("events")
		.update({
			title,
			description,
			hashtag,
			anime_id: animeId,
			scheduled_at: scheduledAtIso,
			duration_minutes: durationMinutes,
		})
		.eq("id", eventId);

	if (error) {
		console.error("event update error:", error);
		return fail(500, { message: "イベントの更新に失敗しました" });
	}

	return { success: true, eventId };
}

/**
 * イベントをキャンセルする（管理者のみ — イベント作成自体が管理者限定のため権限も管理者に統一）
 */
export async function cancelEventAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
	if (!eventId) return fail(400, { message: "イベントIDが不正です" });
	if (!(await isAdminUser(supabase, userId))) return fail(403, { message: "管理者権限が必要です" });

	const event = await getEvent(supabase, eventId);
	if (!event) return fail(404, { message: "イベントが見つかりません" });

	const { error } = await supabase.from("events").update({ is_cancelled: true }).eq("id", eventId);

	if (error) return fail(500, { message: "キャンセルに失敗しました" });
	return { cancelled: true };
}

/**
 * フォローのトグル — フォロー済みなら解除、未フォローなら追加
 */
export async function toggleFollowAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const targetId = (form.get("target_id") as string | null)?.trim() ?? "";
	if (!targetId) return fail(400, { message: "ユーザーIDが不正です" });
	if (targetId === userId) return fail(400, { message: "自分自身をフォローできません" });

	const { data: existingFollow } = await supabase
		.from("follows")
		.select("follower_id")
		.eq("follower_id", userId)
		.eq("following_id", targetId)
		.maybeSingle();

	// ブロック後もフォロー解除はできるようにする（解除は相手との関係を減らす操作）
	if (!existingFollow) {
		const blockFailure = await ensureNotBlocked(supabase, userId, targetId);
		if (blockFailure) return blockFailure;
	}

	const { data: existing } = await supabase
		.from("follows")
		.select("follower_id")
		.eq("follower_id", userId)
		.eq("following_id", targetId)
		.maybeSingle();

	if (existing) {
		const { error: deleteError } = await supabase
			.from("follows")
			.delete()
			.eq("follower_id", userId)
			.eq("following_id", targetId);
		if (deleteError) return fail(500, { message: "フォロー解除に失敗しました" });
		await supabase.from("follow_requests").delete().eq("requester_id", userId).eq("target_id", targetId);
		return { followed: false, requestStatus: "none" };
	}

	const { data: target } = await supabase.from("profiles").select("id, is_private").eq("id", targetId).maybeSingle();
	if (!target) return fail(404, { message: "ユーザーが見つかりません" });

	if (target.is_private) {
		const { data: pendingRequest } = await supabase
			.from("follow_requests")
			.select("requester_id")
			.eq("requester_id", userId)
			.eq("target_id", targetId)
			.maybeSingle();

		if (pendingRequest) {
			await supabase.from("follow_requests").delete().eq("requester_id", userId).eq("target_id", targetId);
			return { followed: false, requestStatus: "none" };
		}

		const { error } = await supabase.from("follow_requests").insert({ requester_id: userId, target_id: targetId });
		if (error) return fail(403, { message: "フォロー申請を送信できませんでした" });
		return { followed: false, requestStatus: "pending" };
	}

	await supabase.from("follow_requests").delete().eq("requester_id", userId).eq("target_id", targetId);

	const { error } = await supabase.from("follows").insert({ follower_id: userId, following_id: targetId });
	if (error) return fail(403, { message: "フォローできませんでした" });
	return { followed: true, requestStatus: "none" };
}

export async function approveFollowRequestAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const requesterId = (form.get("requester_id") as string | null)?.trim() ?? "";
	if (!requesterId) return fail(400, { message: "申請者IDが不正です" });
	if (requesterId === userId) return fail(400, { message: "自分からの申請は承認できません" });

	const { data: followRequest } = await supabase
		.from("follow_requests")
		.select("requester_id")
		.eq("requester_id", requesterId)
		.eq("target_id", userId)
		.eq("status", "pending")
		.maybeSingle();

	if (!followRequest) return fail(404, { message: "フォロー申請が見つかりません" });

	const { data: existingFollow } = await supabase
		.from("follows")
		.select("follower_id")
		.eq("follower_id", requesterId)
		.eq("following_id", userId)
		.maybeSingle();

	const { error: followError } = existingFollow
		? { error: null }
		: await supabase.from("follows").insert({ follower_id: requesterId, following_id: userId });
	if (followError) return fail(500, { message: "フォロー申請の承認に失敗しました" });

	await supabase.from("follow_requests").delete().eq("requester_id", requesterId).eq("target_id", userId);
	return { approved: true };
}

export async function rejectFollowRequestAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const requesterId = (form.get("requester_id") as string | null)?.trim() ?? "";
	if (!requesterId) return fail(400, { message: "申請者IDが不正です" });

	const { error } = await supabase
		.from("follow_requests")
		.delete()
		.eq("requester_id", requesterId)
		.eq("target_id", userId);
	if (error) return fail(500, { message: "フォロー申請の拒否に失敗しました" });
	return { rejected: true };
}

export const MYLIST_SCORE_INVALID_MESSAGE = "スコアは1〜10の整数で指定してください";

/**
 * マイリストのスコアを解釈する（#355）。空（未送信・空文字）は「スコアなし」として null。
 * それ以外は 1〜10 の整数だけを受け付ける（DB は smallint CHECK (score BETWEEN 1 AND 10)）。
 * 以前は parseFloat して 0 より大きいかだけを見ていたため、小数や範囲外が DB で落ちて
 * 原因の分からない 500 になっていた。0 は「なし」ではなく範囲外として扱う。
 */
export function parseMylistScore(raw: FormDataEntryValue | null): { ok: true; score: number | null } | { ok: false } {
	if (raw == null) return { ok: true, score: null };
	if (typeof raw !== "string") return { ok: false };
	const value = raw.trim();
	if (value === "") return { ok: true, score: null };
	if (!/^\d{1,2}$/.test(value)) return { ok: false };
	const score = Number(value);
	return score >= 1 && score <= 10 ? { ok: true, score } : { ok: false };
}

export async function upsertUserAnimeEntry(supabase: SupabaseClient<Database>, request: Request, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const animeId = parsePositiveInt(form.get("anime_id") as string | null);
	const status = (form.get("status") as string | null)?.trim() as AnimeStatus | null;
	const scoreRaw = form.get("score");
	const progressRaw = form.get("progress") as string | null;

	if (!animeId) return fail(400, { message: "アニメIDが不正です" });
	if (!status) return fail(400, { message: "ステータスを選択してください" });

	const parsedScore = parseMylistScore(scoreRaw);
	if (!parsedScore.ok) return fail(400, { message: MYLIST_SCORE_INVALID_MESSAGE });
	const score = parsedScore.score;
	const progress = progressRaw ? parseInt(progressRaw, 10) : 0;
	const dates = parseWatchDates(form, jstDateKey(new Date()));
	if (!dates.ok) return fail(400, { message: dates.message });
	const note = parseMylistNote(form);
	if (!note.ok) return fail(400, { message: note.message });

	// 日付は欄を送ったときだけ書く。空の日付は、視聴ステータスが変わればトリガーが今日で埋める（180）
	const { data: saved, error } = await supabase
		.from("user_anime_list")
		.upsert(
			{ user_id: userId, anime_id: Number(animeId), status, score, progress, ...dates.values },
			{ onConflict: "user_id,anime_id" },
		)
		.select("status, score, progress, updated_at, started_on, finished_on")
		.single();

	if (error || !saved) return fail(500, { message: "マイリストの更新に失敗しました" });

	// メモは欄を送ったときだけ書く（本人だけが読める別の表。マイリストの行より後に書く）
	if (note.value !== undefined) {
		const { error: noteError } =
			note.value === null
				? await supabase.from("user_anime_notes").delete().eq("user_id", userId).eq("anime_id", Number(animeId))
				: await supabase.from("user_anime_notes").upsert(
						{
							user_id: userId,
							anime_id: Number(animeId),
							body: note.value,
							updated_at: new Date().toISOString(),
						},
						{ onConflict: "user_id,anime_id" },
					);
		if (noteError) return fail(500, { message: "メモの保存に失敗しました（ほかの内容は保存しました）" });
	}

	// 保存した内容を返し、画面は読み直さずにこれで表示を変える（トリガーが埋めた日付も含む）
	const entry: UserAnimeEntry = {
		status: saved.status as AnimeStatus,
		score: saved.score,
		progress: saved.progress,
		updated_at: saved.updated_at,
		started_on: saved.started_on,
		finished_on: saved.finished_on,
		...(note.value !== undefined ? { note: note.value } : {}),
	};
	return { success: true, entry };
}

export async function removeUserAnimeEntry(supabase: SupabaseClient<Database>, request: Request, userId: string) {
	const form = await request.formData();
	const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
	if (!animeId) return fail(400, { message: "アニメIDが不正です" });

	const { error } = await supabase
		.from("user_anime_list")
		.delete()
		.eq("user_id", userId)
		.eq("anime_id", Number(animeId));

	if (error) return fail(500, { message: "マイリストの削除に失敗しました" });
	return { success: true };
}

export async function recommendAnimeAction(supabase: SupabaseClient<Database>, request: Request, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
	const recipientId = (form.get("recipient_id") as string | null)?.trim() ?? "";

	if (!animeId || Number.isNaN(Number(animeId))) return fail(400, { recommendMessage: "アニメが見つかりません" });
	if (!recipientId) return fail(400, { recommendMessage: "推薦先のユーザーを選択してください" });
	if (recipientId === userId) return fail(400, { recommendMessage: "自分自身には推薦できません" });

	const { data: anime } = await supabase.from("anime").select("id").eq("id", Number(animeId)).maybeSingle();
	if (!anime) return fail(404, { recommendMessage: "アニメが見つかりません" });

	const { data: recipient } = await supabase.from("profiles").select("id").eq("id", recipientId).maybeSingle();
	if (!recipient) return fail(404, { recommendMessage: "ユーザーが見つかりません" });

	const blockFailure = await ensureNotBlocked(supabase, userId, recipientId);
	if (blockFailure) {
		return fail(403, { recommendMessage: "このユーザーにはおすすめを送れません" });
	}

	const { error } = await supabase.from("anime_recommendations").insert({
		recommender_id: userId,
		recipient_id: recipientId,
		anime_id: Number(animeId),
	});

	if (error) {
		console.error("anime recommendation error:", error);
		return fail(500, { recommendMessage: "推薦の送信に失敗しました" });
	}

	return { recommendSuccess: true };
}

export async function exchangeAnimeAction(supabase: SupabaseClient<Database>, request: Request, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
	const animeIdNumber = Number(animeId);
	const comment = ((form.get("comment") as string | null)?.trim() ?? "") || null;
	const subjectiveTags = toExchangeSubjectiveTags(form.getAll("subjective_tags"));

	if (!/^\d+$/.test(animeId) || !Number.isSafeInteger(animeIdNumber) || animeIdNumber <= 0) {
		return fail(400, { exchangeMessage: "アニメを選択してください" });
	}

	if (comment && comment.length > 120) {
		return fail(400, { exchangeMessage: "コメントは120文字以内で入力してください" });
	}
	if (subjectiveTags.length > MAX_EXCHANGE_SUBJECTIVE_TAGS) {
		return fail(400, { exchangeMessage: "タグは3個まで選択できます" });
	}
	if (!validateExchangeSubjectiveTags(subjectiveTags)) {
		return fail(400, { exchangeMessage: "タグの指定が不正です" });
	}

	const { data, error } = await supabase.rpc("create_anime_exchange", {
		p_anime_id: animeIdNumber,
		...(comment ? { p_comment: comment } : {}),
		p_subjective_tags: subjectiveTags,
	});

	if (error) {
		const exchangeErrorDetail = getAnimeExchangeErrorDetail(error);
		if (exchangeErrorDetail) {
			const mapped = animeExchangeErrorMessages[exchangeErrorDetail];
			return fail(mapped.status, { exchangeMessage: mapped.message });
		}
		console.error("anime exchange error:", error);
		return fail(500, { exchangeMessage: "トレードに失敗しました" });
	}

	const result = data?.[0] ?? null;
	let receivedAnime: { id: string; title: string; cover_url: string | null } | null = null;
	if (result?.received_anime_id != null) {
		const { data: animeRow } = await supabase
			.from("anime")
			.select("id, title, cover_url")
			.eq("id", result.received_anime_id)
			.maybeSingle();

		if (animeRow) {
			receivedAnime = {
				id: String(animeRow.id),
				title: animeRow.title,
				cover_url: animeRow.cover_url,
			};
		}
	}

	return {
		exchangeSuccess: true,
		exchangeMatched: result?.received_anime_id != null,
		receivedAnime,
	};
}

export async function cancelAnimeExchangeAction(supabase: SupabaseClient<Database>, userId: string) {
	const { data, error } = await supabase.rpc("cancel_anime_exchange");
	if (error) {
		console.error("anime exchange cancel error:", { userId, error });
		return fail(500, { cancelMessage: "マッチングのキャンセルに失敗しました" });
	}

	const result = data?.[0] ?? null;
	if (!result?.cancelled) {
		return fail(409, { cancelMessage: "待機中のトレードが見つかりません" });
	}

	return { cancelSuccess: true };
}

export async function toggleBroadcastSubscription(
	supabase: SupabaseClient<Database>,
	userId: string,
	animeId: string,
): Promise<{ subscribed: boolean }> {
	const numericAnimeId = Number(animeId);
	if (!Number.isFinite(numericAnimeId)) {
		throw new Error("Invalid anime_id");
	}

	const { data: existing, error: selectError } = await supabase
		.from("broadcast_notification_subscriptions")
		.select("anime_id")
		.eq("user_id", userId)
		.eq("anime_id", numericAnimeId)
		.maybeSingle();

	if (selectError) throw selectError;

	if (existing) {
		const { error: deleteError } = await supabase
			.from("broadcast_notification_subscriptions")
			.delete()
			.eq("user_id", userId)
			.eq("anime_id", numericAnimeId);
		if (deleteError) throw deleteError;
		return { subscribed: false };
	}

	const { error: insertError } = await supabase
		.from("broadcast_notification_subscriptions")
		.insert({ user_id: userId, anime_id: numericAnimeId });
	if (insertError) throw insertError;
	return { subscribed: true };
}

export async function updateBroadcastNotificationSettings(
	supabase: SupabaseClient<Database>,
	userId: string,
	settings: import("$lib/types").BroadcastNotificationSettings,
): Promise<void> {
	const { error } = await supabase.from("broadcast_notification_settings").upsert({
		user_id: userId,
		notify_1min: settings.notify_1min,
		notify_5min: settings.notify_5min,
		notify_30min: settings.notify_30min,
		updated_at: new Date().toISOString(),
	});
	if (error) throw error;
}

export async function setPasswordAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	_userId: string,
): Promise<{ success: true } | { error: string; field?: string }> {
	const form = await request.formData();
	const password = (form.get("password") as string | null) ?? "";
	const confirm = (form.get("confirm") as string | null) ?? "";

	if (password.length < MIN_PASSWORD_LENGTH) {
		return {
			error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
			field: "password",
		};
	}
	if (password !== confirm) {
		return {
			error: "パスワードが一致しません",
			field: "confirm",
		};
	}

	const { error } = await supabase.auth.updateUser({ password });
	if (error) {
		return { error: "パスワードの設定に失敗しました" };
	}

	return { success: true };
}

export async function updateNotificationSettingsAction(
	request: Request,
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<void> {
	const form = await request.formData();
	const settings = {
		notify_1min: form.get("notify_1min") === "on",
		notify_5min: form.get("notify_5min") === "on",
		notify_30min: form.get("notify_30min") === "on",
	};

	await updateBroadcastNotificationSettings(supabase, userId, settings);
}

const ONBOARDING_USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const ONBOARDING_MAX_DISPLAY_NAME_LENGTH = 50;
const ONBOARDING_ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ONBOARDING_MAX_AVATAR_SIZE = 2 * 1024 * 1024;

type ProfileSetupResult =
	| { success: true }
	| {
			error: string;
			status: number;
			field?: "username" | "display_name" | "avatar";
			values: { username: string; display_name: string };
	  };

type ProfileSetupOptions = {
	oauthAvatarUrl?: string | null;
	/** テスト用。OAuth 画像の取得に使う */
	fetchFn?: typeof fetch;
};

/** 検証済みの画像を本人の profile-avatars に置き、公開 URL と置き換える古いファイルを返す */
async function storeOnboardingAvatar(
	supabase: SupabaseClient<Database>,
	userId: string,
	bytes: ArrayBuffer,
	validated: { mime: string; ext: string },
): Promise<{ url: string; path: string; stalePaths: string[] } | { error: string }> {
	const { data: existingFiles } = await supabase.storage.from("profile-avatars").list(userId);
	const path = `${userId}/avatar_${Date.now()}.${validated.ext}`;
	const { error } = await supabase.storage
		.from("profile-avatars")
		.upload(path, bytes, { contentType: validated.mime, upsert: true });
	if (error) {
		console.error("onboarding avatar upload error:", error);
		return { error: "画像のアップロードに失敗しました" };
	}

	const {
		data: { publicUrl },
	} = supabase.storage.from("profile-avatars").getPublicUrl(path);
	const stalePaths = (existingFiles ?? [])
		.map((file) => `${userId}/${file.name}`)
		.filter((existingPath) => existingPath !== path);
	return { url: publicUrl, path, stalePaths };
}

async function uploadOnboardingAvatar(
	supabase: SupabaseClient<Database>,
	userId: string,
	file: File,
): Promise<{ url: string; path: string; stalePaths: string[] } | { error: string }> {
	if (!ONBOARDING_ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ONBOARDING_ALLOWED_AVATAR_TYPES)[number])) {
		return { error: "対応していないファイル形式です（JPEG/PNG/WebP）" };
	}
	if (file.size > ONBOARDING_MAX_AVATAR_SIZE) {
		return { error: "画像は2MB以内にしてください" };
	}

	const arrayBuffer = await file.arrayBuffer();
	const validated = validateImageBuffer(arrayBuffer, ONBOARDING_ALLOWED_AVATAR_TYPES);
	if (!validated) {
		return { error: "対応していないファイル形式です（JPEG/PNG/WebP）" };
	}

	return storeOnboardingAvatar(supabase, userId, arrayBuffer, validated);
}

type ProfileSetupFormReadFailure = "too_large" | "invalid";

/**
 * プロフィール作成フォームを上限付きで読む（#327）。
 * request.formData() を先に呼ぶと、巨大な multipart を全部メモリへ展開した後でしかサイズを検査できない。
 * ルートは next などを取り出すためにフォームを読むので、最初の読み込みをこれにする。
 */
export function readProfileSetupForm(request: Request): Promise<FormData | ProfileSetupFormReadFailure> {
	return readFormDataWithLimit(request, ONBOARDING_MAX_AVATAR_SIZE + MULTIPART_OVERHEAD_BYTES);
}

/** 初回オンボーディング：ユーザーが確認した公開プロフィールを初めて作成する */
export async function completeProfileSetupAction(
	requestOrForm: Request | FormData | ProfileSetupFormReadFailure,
	supabase: SupabaseClient<Database>,
	userId: string,
	options: ProfileSetupOptions = {},
): Promise<ProfileSetupResult> {
	// アバターファイルを含むフォームのため、サイズ検証前の全量バッファを避けて上限付きで読む。
	// ルートが readProfileSetupForm で先に読んだ結果（読み込み失敗を含む）もそのまま受け取る
	const parsedForm = requestOrForm instanceof Request ? await readProfileSetupForm(requestOrForm) : requestOrForm;
	if (parsedForm === "too_large") {
		return {
			error: "画像は2MB以内にしてください",
			status: 413,
			field: "avatar",
			values: { username: "", display_name: "" },
		};
	}
	if (parsedForm === "invalid") {
		return {
			error: "フォームの送信内容を読み取れませんでした",
			status: 400,
			values: { username: "", display_name: "" },
		};
	}
	const form = parsedForm;
	const usernameEntry = form.get("username");
	const displayNameEntry = form.get("display_name");
	const avatarChoiceEntry = form.get("avatar_choice");
	const avatarFileEntry = form.get("avatar_file");
	const username = typeof usernameEntry === "string" ? usernameEntry.trim().toLowerCase() : "";
	const displayName = typeof displayNameEntry === "string" ? displayNameEntry.trim() : "";
	const avatarChoice = typeof avatarChoiceEntry === "string" ? avatarChoiceEntry : "none";
	const values = { username, display_name: displayName };

	if (!ONBOARDING_USERNAME_PATTERN.test(username)) {
		return {
			error: "ユーザー名は3〜20文字の半角英数字・アンダースコアのみ使用できます",
			status: 400,
			field: "username",
			values,
		};
	}

	if (displayName.length > ONBOARDING_MAX_DISPLAY_NAME_LENGTH) {
		return {
			error: "表示名は50文字以内で入力してください",
			status: 400,
			field: "display_name",
			values,
		};
	}

	let avatarUrl: string | null = null;
	let uploadedAvatarPath: string | null = null;
	let staleAvatarPaths: string[] = [];
	if (avatarChoice === "oauth") {
		// 外部 URL は保存せず、自前の Storage に取り込む（#328）。取得できなければ画像なしで作成し、
		// プロバイダー側の一時的な不調でプロフィール作成自体を止めない（後から設定で変えられる）
		const fetched = await fetchOAuthAvatar(options.oauthAvatarUrl, options.fetchFn);
		if (fetched) {
			const stored = await storeOnboardingAvatar(supabase, userId, fetched.bytes, fetched);
			if ("error" in stored) {
				return { error: stored.error, status: 500, field: "avatar", values };
			}
			avatarUrl = stored.url;
			uploadedAvatarPath = stored.path;
			staleAvatarPaths = stored.stalePaths;
		} else {
			console.warn("onboarding: OAuth avatar could not be imported; continuing without avatar");
		}
	} else if (avatarChoice === "upload") {
		if (!(avatarFileEntry instanceof File) || avatarFileEntry.size === 0) {
			return { error: "プロフィール画像を選択してください", status: 400, field: "avatar", values };
		}
		const uploaded = await uploadOnboardingAvatar(supabase, userId, avatarFileEntry);
		if ("error" in uploaded) {
			return { error: uploaded.error, status: 400, field: "avatar", values };
		}
		avatarUrl = uploaded.url;
		uploadedAvatarPath = uploaded.path;
		staleAvatarPaths = uploaded.stalePaths;
	}

	const { error } = await supabase
		.from("profiles")
		.insert({ id: userId, username, display_name: displayName || null, avatar_url: avatarUrl });

	if (error) {
		console.error("onboarding profile insert error:", {
			userId,
			code: error.code,
			message: error.message,
			details: error.details,
		});
		if (uploadedAvatarPath) {
			await supabase.storage.from("profile-avatars").remove([uploadedAvatarPath]);
		}
		if (error.code === "23505") {
			if (error.message.includes(USERNAME_HELD_ERROR_MESSAGE)) {
				return { error: USERNAME_HELD_USER_MESSAGE, status: 400, field: "username", values };
			}
			if (error.message.includes("username")) {
				return { error: "このユーザー名はすでに使用されています", status: 400, field: "username", values };
			}
			return { error: "オンボーディングはすでに完了しています", status: 409, values };
		}
		return { error: "保存に失敗しました。しばらく経ってから再試行してください", status: 500, values };
	}

	if (staleAvatarPaths.length > 0) {
		const { error: cleanupError } = await supabase.storage.from("profile-avatars").remove(staleAvatarPaths);
		if (cleanupError) console.error("onboarding stale avatar cleanup error:", cleanupError);
	}

	return { success: true };
}

export async function upsertBroadcastRoomMute(
	supabase: SupabaseClient<Database>,
	userId: string,
	animeId: string,
	roomDate: string,
	duration: BroadcastRoomMuteDuration,
	repeatWeekly = false,
) {
	if (!animeId || Number.isNaN(Number(animeId))) return fail(400, { message: "アニメが見つかりません" });

	const { data: sessions } = await supabase.rpc("ensure_broadcast_room_session", {
		p_anime_id: Number(animeId),
		p_room_date: roomDate,
	});
	const session = sessions?.[0];
	if (!session) return fail(404, { message: "放送ルームが見つかりません" });
	if (repeatWeekly && duration === "event_end") {
		return fail(400, { message: "毎週繰り返す場合は、1日から7日のミュート期間を選択してください" });
	}

	const now = new Date();
	const mutedUntil =
		duration === "event_end"
			? new Date(session.posting_closes_at)
			: new Date(
					(repeatWeekly
						? new Date(session.scheduled_at).getTime()
						: Math.max(now.getTime(), new Date(session.scheduled_at).getTime())) +
						duration * 24 * 60 * 60 * 1000,
				);
	if (!repeatWeekly && mutedUntil <= now) {
		return fail(400, { message: "終了済みのルームは「イベント終了まで」に設定できません" });
	}

	const roomMute = {
		user_id: userId,
		anime_id: Number(animeId),
		room_date: roomDate,
		room_session_id: session.id,
		duration_days: duration === "event_end" ? null : duration,
		mute_until_event_end: duration === "event_end",
		repeat_weekly: repeatWeekly,
		muted_until: mutedUntil.toISOString(),
		updated_at: now.toISOString(),
	};
	const roomMutesTable = supabase.from("broadcast_room_mutes") as unknown as {
		upsert: (value: typeof roomMute, options: { onConflict: string }) => PromiseLike<{ error: unknown }>;
	};
	const { error } = await roomMutesTable.upsert(roomMute, { onConflict: "user_id,anime_id" });
	if (error) {
		console.error("broadcast room mute upsert error:", error);
		return fail(500, { message: "ルームのミュート設定に失敗しました" });
	}
	return { roomMuteSuccess: true };
}

export async function removeBroadcastRoomMute(supabase: SupabaseClient<Database>, userId: string, animeId: string) {
	const { error } = await supabase
		.from("broadcast_room_mutes")
		.delete()
		.eq("user_id", userId)
		.eq("anime_id", Number(animeId));
	if (error) return fail(500, { message: "ルームのミュート解除に失敗しました" });
	return { roomMuteSuccess: true };
}

/** 文字列を正の整数に正規化する。整数でない・0以下・桁あふれは null を返す。 */
export function parsePositiveInt(value: string | null): number | null {
	if (value == null) return null;
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** settings/mutes のアニメミュート更新フォームを処理する（パース・検証・upsert を所有） */
export async function updateAnimeMuteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
	const muteType = form.get("mute_type") as string | null;
	if (!animeId || (muteType !== "period" && muteType !== "always")) {
		return fail(400, { message: "入力内容を確認してください" });
	}
	const periodDays =
		muteType === "period" ? parsePositiveInt((form.get("period_days") as string | null) ?? "3") : null;
	if (muteType === "period" && (periodDays == null || periodDays < 1 || periodDays > 7)) {
		return fail(400, { message: "ミュート期間を選択してください（1〜7日）" });
	}
	const isRepeat = form.get("is_repeat") === "on";

	return upsertAnimeMute(supabase, userId, String(animeId), muteType, periodDays, isRepeat, null);
}

/** settings/mutes のアニメミュート解除フォームを処理する（パース・検証・削除を所有） */
export async function removeAnimeMuteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const animeId = parsePositiveInt(form.get("anime_id") as string | null);
	if (!animeId) return fail(400, { message: "ミュート設定が見つかりません" });
	return removeAnimeMute(supabase, userId, String(animeId));
}

export async function upsertAnimeMute(
	supabase: SupabaseClient<Database>,
	userId: string,
	animeId: string,
	muteType: "period" | "always",
	periodDays: number | null,
	isRepeat: boolean,
	roomDate: string | null,
) {
	if (!animeId || Number.isNaN(Number(animeId))) return fail(400, { message: "アニメが見つかりません" });

	let mutedUntil: string | null = null;
	if (muteType === "period" && periodDays != null && !isRepeat) {
		// 起点はルームの放送日の始まり（JST 04:00）。サーバーの時刻帯に依存させない（#326）
		mutedUntil = computeMutedUntil(roomDate, periodDays).toISOString();
	}

	const record = {
		user_id: userId,
		anime_id: Number(animeId),
		mute_type: muteType,
		period_days: muteType === "period" ? periodDays : null,
		is_repeat: isRepeat,
		muted_until: mutedUntil,
		updated_at: new Date().toISOString(),
	};
	const { error } = await supabase.from("anime_mutes").upsert(record, { onConflict: "user_id,anime_id" });
	if (error) {
		console.error("anime mute upsert error:", error);
		return fail(500, { message: "ミュート設定に失敗しました" });
	}
	return { roomMuteSuccess: true };
}

export async function removeAnimeMute(supabase: SupabaseClient<Database>, userId: string, animeId: string) {
	const { error } = await supabase.from("anime_mutes").delete().eq("user_id", userId).eq("anime_id", Number(animeId));
	if (error) return fail(500, { message: "ミュート解除に失敗しました" });
	return { roomMuteSuccess: true };
}

/**
 * settings/mutes のイベントミュート追加フォームを処理する。
 * イベントは再放送がないため one-shot（常にミュート＝そのイベントの投稿を恒久的に非表示）。
 */
export async function updateEventMuteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
	if (!eventId) return fail(400, { message: "イベントが見つかりません" });

	const { error } = await supabase
		.from("event_mutes")
		.upsert({ user_id: userId, event_id: eventId }, { onConflict: "user_id,event_id" });
	if (error) {
		console.error("event mute upsert error:", error);
		return fail(500, { message: "ミュート設定に失敗しました" });
	}
	return { eventMuteSuccess: true };
}

/** settings/mutes のイベントミュート解除フォームを処理する */
export async function removeEventMuteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
	if (!eventId) return fail(400, { message: "ミュート設定が見つかりません" });

	const { error } = await supabase.from("event_mutes").delete().eq("user_id", userId).eq("event_id", eventId);
	if (error) return fail(500, { message: "ミュート解除に失敗しました" });
	return { eventMuteSuccess: true };
}

/** イベント開始前通知設定（1分前/5分前/30分前）の upsert を処理する */
/**
 * イベント通知のオン/オフをトグルする（toggleBroadcastSubscription のイベント版）。
 * 行の存在 = 通知オン。通知タイミングはリアタイルームと共通の
 * broadcast_notification_settings で管理する。
 */
export async function toggleEventNotificationSubscription(
	supabase: SupabaseClient<Database>,
	userId: string,
	eventId: string,
): Promise<{ subscribed: boolean }> {
	const { data: existing, error: selectError } = await supabase
		.from("event_notification_settings")
		.select("event_id")
		.eq("user_id", userId)
		.eq("event_id", eventId)
		.maybeSingle();

	if (selectError) throw selectError;

	if (existing) {
		const { error: deleteError } = await supabase
			.from("event_notification_settings")
			.delete()
			.eq("user_id", userId)
			.eq("event_id", eventId);
		if (deleteError) throw deleteError;
		return { subscribed: false };
	}

	const { error: insertError } = await supabase
		.from("event_notification_settings")
		.insert({ user_id: userId, event_id: eventId });
	if (insertError) throw insertError;
	return { subscribed: true };
}

export async function linkAccounts(
	serviceClient: SupabaseClient<Database>,
	userIdA: string,
	userIdB: string,
	displayOrderForA: number,
): Promise<{ error: string | null }> {
	const { error } = await serviceClient.from("linked_accounts").upsert([
		{ owner_user_id: userIdA, linked_user_id: userIdB, display_order: displayOrderForA },
		{ owner_user_id: userIdB, linked_user_id: userIdA, display_order: 0 },
	]);
	return { error: error ? error.message : null };
}

export function createInviteErrorStatus(error: { details?: unknown }): 403 | 429 | 500 {
	if (error.details === "INVITE_FORBIDDEN") return 403;
	if (error.details === "INVITE_ACCOUNT_RESTRICTED") return 403;
	if (error.details === "INVITE_CREATE_LIMIT") return 429;
	return 500;
}

// invites/invite_redemptions は自動生成型未収録のため .rpc()/.from() に型アサーションを使用
export async function createInviteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const maxUsesRaw = (form.get("max_uses") as string | null)?.trim() ?? "";
	const expiresAtRaw = (form.get("expires_at") as string | null)?.trim() ?? "";

	const maxUses = maxUsesRaw ? Number(maxUsesRaw) : 1;
	if (!Number.isSafeInteger(maxUses) || maxUses <= 0) {
		return fail(400, { inviteMessage: "使用回数は1以上の整数で指定してください" });
	}

	let expiresAtIso: string | null = null;
	if (expiresAtRaw) {
		const parsed = new Date(expiresAtRaw);
		if (Number.isNaN(parsed.getTime())) {
			return fail(400, { inviteMessage: "有効期限の形式が正しくありません" });
		}
		expiresAtIso = parsed.toISOString();
	}

	// 期限なしは引数を省略する（RPC 側の既定 NULL = 無期限）
	const { data, error } = await supabase.rpc("create_invite", {
		p_max_uses: maxUses,
		...(expiresAtIso ? { p_expires_at: expiresAtIso } : {}),
	});

	if (error) {
		console.error("create_invite error:", { userId, error });
		const status = createInviteErrorStatus(error);
		if (status === 429) {
			return fail(429, {
				inviteMessage: "招待の同時発行数が上限に達しています。既存の招待が使われるか失効するまでお待ちください",
			});
		}
		if (status === 403) {
			return fail(403, {
				inviteMessage:
					error.details === "INVITE_ACCOUNT_RESTRICTED"
						? "このアカウントは制限中のため招待コードを発行できません"
						: "招待コードを発行する権限がありません",
			});
		}
		return fail(status, { inviteMessage: "招待コードの発行に失敗しました" });
	}

	return { inviteSuccess: true, inviteCode: data as string };
}

export async function revokeInviteAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const inviteId = (form.get("invite_id") as string | null)?.trim() ?? "";
	if (!inviteId) return fail(400, { inviteMessage: "招待IDが不正です" });

	const { error } = await supabase.rpc("revoke_invite", { p_invite_id: inviteId });
	if (error) {
		console.error("revoke_invite error:", { userId, error });
		// 42501 = RPC 側の権限チェック（発行者本人・管理者以外）による拒否
		if (error.code === "42501") {
			return fail(403, { inviteMessage: "この招待を失効させる権限がありません" });
		}
		return fail(500, { inviteMessage: "招待の失効に失敗しました" });
	}

	return { inviteRevoked: true };
}
