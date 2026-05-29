import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@sveltejs/kit";
import type { Database, Json } from "$lib/supabase/database.types";
import type { AnimeExchangeShare, AnimeStatus, BroadcastRoomMuteDuration } from "$lib/types";
import { extractHashtags, extractMentions } from "$lib/utils/hashtag";

const reportStatuses = new Set(["open", "reviewing", "resolved", "rejected"]);
const moderationStatuses = new Set(["active", "restricted", "banned"]);

export type ModerationStatus = "active" | "restricted" | "banned";

type ModerationProfile = {
	moderation_status: ModerationStatus;
	moderation_until: string | null;
};

export async function getCurrentModerationStatus(
	supabase: SupabaseClient<Database>,
	userId: string,
): Promise<ModerationProfile> {
	const { data } = await supabase
		.from("account_moderation")
		.select("status, restricted_until")
		.eq("user_id", userId)
		.maybeSingle();
	const status = (data?.status ?? "active") as ModerationStatus;
	const until = data?.restricted_until ?? null;

	if (status === "restricted" && until && new Date(until).getTime() <= Date.now()) {
		return { moderation_status: "active", moderation_until: until };
	}

	return { moderation_status: status, moderation_until: until };
}

export async function ensureAccountCanWrite(supabase: SupabaseClient<Database>, userId: string) {
	const profile = await getCurrentModerationStatus(supabase, userId);
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
 * 投稿（＋ハッシュタグ）を挿入する共通ロジック
 * タイムラインの createPost とリプライの reply で使い回す
 */
export async function insertPostWithHashtags(
	supabase: SupabaseClient<Database>,
	userId: string,
	content: string,
	parentId: string | null = null,
	imageUrls: string[] = [],
	animeId: string | null = null,
	quotedPostId: string | null = null,
	exchangeShare: AnimeExchangeShare | null = null,
	broadcastRoomSessionId: string | null = null,
) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	if (!content && imageUrls.length === 0 && !animeId && !exchangeShare) {
		return fail(400, { message: "本文、画像、アニメ引用、または交換結果を追加してください" });
	}
	if (content.length > 280) return fail(400, { message: "280文字以内で入力してください" });

	if (parentId) {
		const { data: parent } = await supabase.from("posts").select("id").eq("id", parentId).maybeSingle();
		if (!parent) return fail(404, { message: "返信先の投稿を表示できません" });
	}

	if (quotedPostId) {
		const { data: quotedPost } = await supabase.from("posts").select("id").eq("id", quotedPostId).maybeSingle();
		if (!quotedPost) return fail(404, { message: "引用元の投稿を表示できません" });
	}

	const postContent = exchangeShare && content.length === 0 ? "アニメ交換の結果を共有しました" : content;
	const basePost = {
		user_id: userId,
		content: postContent,
		parent_id: parentId,
		image_urls: imageUrls,
		anime_id: animeId ? Number(animeId) : null,
		quoted_post_id: quotedPostId || null,
		broadcast_room_session_id: broadcastRoomSessionId,
	};
	const postPayload = exchangeShare ? { ...basePost, exchange_share: exchangeShare as unknown as Json } : basePost;

	const { data: post, error: postError } = await supabase.from("posts").insert(postPayload).select("id").single();

	if (postError || !post) {
		console.error("post insert error:", postError);
		return fail(500, { message: exchangeShare ? "交換結果つき投稿の保存に失敗しました" : "投稿に失敗しました" });
	}

	// ハッシュタグを処理（重複エラーは無視）
	const tags = extractHashtags(postContent);
	for (const tag of tags) {
		await supabase.from("hashtags").insert({ name: tag });
		const { data: hashtag } = await supabase.from("hashtags").select("id").eq("name", tag).maybeSingle();
		if (hashtag) {
			await supabase.from("post_hashtags").insert({ post_id: post.id, hashtag_id: hashtag.id });
		}
	}

	// メンション通知（エラーは無視）
	const mentionedUsernames = extractMentions(postContent);
	if (mentionedUsernames.length > 0) {
		const { data: mentionedUsers } = await supabase
			.from("profiles")
			.select("id")
			.in("username", mentionedUsernames);
		if (mentionedUsers) {
			for (const mentioned of mentionedUsers) {
				if (mentioned.id !== userId) {
					await supabase.from("notifications").insert({
						recipient_id: mentioned.id,
						actor_id: userId,
						type: "mention",
						post_id: post.id,
					});
				}
			}
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

	const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);

	if (error) return fail(500, { message: "削除に失敗しました" });

	return { deleted: true };
}

/**
 * いいねのトグル — 既にいいね済みなら削除、未いいねなら挿入
 */
export async function toggleLikeAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing } = await supabase
		.from("likes")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();

	if (existing) {
		await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
		return { liked: false };
	}

	const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
	if (error) return fail(403, { message: "この投稿にいいねできません" });
	return { liked: true };
}

/**
 * リポストのトグル — 既にリポスト済みなら削除、未リポストなら挿入
 */
export async function toggleBookmarkAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing } = await supabase
		.from("bookmarks")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();

	if (existing) {
		await supabase.from("bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
		return { bookmarked: false };
	}

	const { error } = await supabase.from("bookmarks").insert({ post_id: postId, user_id: userId });
	if (error) return fail(403, { message: "この投稿をブックマークできません" });
	return { bookmarked: true };
}

export async function toggleRepostAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const postId = (form.get("post_id") as string | null)?.trim() ?? "";
	if (!postId) return fail(400, { message: "投稿IDが不正です" });

	const { data: existing } = await supabase
		.from("reposts")
		.select("post_id")
		.eq("post_id", postId)
		.eq("user_id", userId)
		.maybeSingle();

	if (existing) {
		await supabase.from("reposts").delete().eq("post_id", postId).eq("user_id", userId);
		return { reposted: false };
	}

	const { error } = await supabase.from("reposts").insert({ post_id: postId, user_id: userId });
	if (error) return fail(403, { message: "この投稿をリポストできません" });
	return { reposted: true };
}

/**
 * 全通知を既読にする
 */
export async function markAllNotificationsRead(supabase: SupabaseClient<Database>, userId: string) {
	await supabase.from("notifications").update({ read: true }).eq("recipient_id", userId).eq("read", false);
}

export async function generateDueBroadcastNotifications(supabase: SupabaseClient<Database>): Promise<void> {
	const rpcClient = supabase as unknown as {
		rpc: (functionName: "generate_due_broadcast_notifications") => Promise<{ error: { message: string } | null }>;
	};
	const { error } = await rpcClient.rpc("generate_due_broadcast_notifications");
	if (error) {
		console.error("broadcast notification generation error:", error.message);
	}
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

	const { error } = await supabase.from("posts").delete().eq("id", postId);
	if (error) return fail(500, { message: "投稿の削除に失敗しました" });

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
export async function createEventAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const title = (form.get("title") as string | null)?.trim() ?? "";
	const description = (form.get("description") as string | null)?.trim() || null;
	const rawHashtag = (form.get("hashtag") as string | null)?.trim() ?? "";
	const scheduledAtRaw = (form.get("scheduled_at") as string | null)?.trim() ?? "";
	const durationRaw = (form.get("duration_minutes") as string | null)?.trim() ?? "";

	if (!title) return fail(400, { message: "タイトルを入力してください" });
	if (title.length > 100) return fail(400, { message: "タイトルは100文字以内で入力してください" });

	const hashtag = rawHashtag.replace(/^#/, "").toLowerCase();
	if (!hashtag) return fail(400, { message: "ハッシュタグを入力してください" });
	if (hashtag.length > 50) return fail(400, { message: "ハッシュタグは50文字以内で入力してください" });
	if (!/^[a-z0-9_\u3000-\u9fff\uff00-\uffef\u4e00-\u9fff]+$/u.test(hashtag)) {
		return fail(400, { message: "ハッシュタグに使用できない文字が含まれています" });
	}

	if (!scheduledAtRaw) return fail(400, { message: "開始日時を入力してください" });
	const scheduledAt = new Date(scheduledAtRaw);
	if (Number.isNaN(scheduledAt.getTime())) return fail(400, { message: "開始日時の形式が正しくありません" });

	const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : null;
	if (durationMinutes !== null && (Number.isNaN(durationMinutes) || durationMinutes <= 0)) {
		return fail(400, { message: "配信時間は正の整数で入力してください" });
	}

	const { data: event, error } = await supabase
		.from("events")
		.insert({
			creator_id: userId,
			title,
			description,
			hashtag,
			scheduled_at: scheduledAt.toISOString(),
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
 * イベントをキャンセルする（作成者のみ）
 */
export async function cancelEventAction(request: Request, supabase: SupabaseClient<Database>, userId: string) {
	const form = await request.formData();
	const eventId = (form.get("event_id") as string | null)?.trim() ?? "";
	if (!eventId) return fail(400, { message: "イベントIDが不正です" });

	const { error } = await supabase
		.from("events")
		.update({ is_cancelled: true })
		.eq("id", eventId)
		.eq("creator_id", userId);

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

	const { data: existing } = await supabase
		.from("follows")
		.select("follower_id")
		.eq("follower_id", userId)
		.eq("following_id", targetId)
		.maybeSingle();

	if (existing) {
		await supabase.from("follows").delete().eq("follower_id", userId).eq("following_id", targetId);
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

export async function upsertUserAnimeEntry(supabase: SupabaseClient<Database>, request: Request, userId: string) {
	const moderationFailure = await ensureAccountCanWrite(supabase, userId);
	if (moderationFailure) return moderationFailure;

	const form = await request.formData();
	const animeId = (form.get("anime_id") as string | null)?.trim() ?? "";
	const status = (form.get("status") as string | null)?.trim() as AnimeStatus | null;
	const scoreRaw = form.get("score") as string | null;
	const progressRaw = form.get("progress") as string | null;

	if (!animeId) return fail(400, { message: "アニメIDが不正です" });
	if (!status) return fail(400, { message: "ステータスを選択してください" });

	const score = scoreRaw ? parseFloat(scoreRaw) : null;
	const progress = progressRaw ? parseInt(progressRaw, 10) : 0;

	const { error } = await supabase
		.from("user_anime_list")
		.upsert(
			{ user_id: userId, anime_id: Number(animeId), status, score, progress },
			{ onConflict: "user_id,anime_id" },
		);

	if (error) return fail(500, { message: "マイリストの更新に失敗しました" });
	return { success: true };
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

	if (!userId) return fail(401, { exchangeMessage: "ログインが必要です" });
	if (!animeId || Number.isNaN(Number(animeId))) {
		return fail(400, { exchangeMessage: "アニメを選択してください" });
	}

	const { data, error } = await supabase.rpc("create_anime_exchange", { p_anime_id: Number(animeId) });

	if (error) {
		if (error.message.includes("anime not found")) {
			return fail(404, { exchangeMessage: "アニメが見つかりません" });
		}
		console.error("anime exchange error:", error);
		return fail(500, { exchangeMessage: "交換に失敗しました" });
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

export async function toggleBroadcastSubscription(
	supabase: SupabaseClient<Database>,
	userId: string,
	animeId: string,
): Promise<{ subscribed: boolean }> {
	const { data: existing } = await supabase
		.from("broadcast_notification_subscriptions")
		.select("anime_id")
		.eq("user_id", userId)
		.eq("anime_id", Number(animeId))
		.maybeSingle();

	if (existing) {
		await supabase
			.from("broadcast_notification_subscriptions")
			.delete()
			.eq("user_id", userId)
			.eq("anime_id", Number(animeId));
		return { subscribed: false };
	}

	await supabase.from("broadcast_notification_subscriptions").insert({ user_id: userId, anime_id: Number(animeId) });
	return { subscribed: true };
}

export async function updateBroadcastNotificationSettings(
	supabase: SupabaseClient<Database>,
	userId: string,
	settings: import("$lib/types").BroadcastNotificationSettings,
): Promise<void> {
	await supabase.from("broadcast_notification_settings").upsert({
		user_id: userId,
		notify_1min: settings.notify_1min,
		notify_5min: settings.notify_5min,
		notify_30min: settings.notify_30min,
		updated_at: new Date().toISOString(),
	});
}

export async function upsertBroadcastRoomMute(
	supabase: SupabaseClient<Database>,
	userId: string,
	animeId: string,
	roomDate: string,
	duration: BroadcastRoomMuteDuration,
) {
	if (!animeId || Number.isNaN(Number(animeId))) return fail(400, { message: "アニメが見つかりません" });

	const { data: sessions } = await supabase.rpc("ensure_broadcast_room_session", {
		p_anime_id: Number(animeId),
		p_room_date: roomDate,
	});
	const session = sessions?.[0];
	if (!session) return fail(404, { message: "放送ルームが見つかりません" });

	const now = new Date();
	const mutedUntil =
		duration === "event_end"
			? new Date(session.posting_closes_at)
			: new Date(
					Math.max(now.getTime(), new Date(session.scheduled_at).getTime()) + duration * 24 * 60 * 60 * 1000,
				);
	if (mutedUntil <= now) {
		return fail(400, { message: "終了済みのルームは「イベント終了まで」に設定できません" });
	}

	const { error } = await supabase.from("broadcast_room_mutes").upsert(
		{
			user_id: userId,
			anime_id: Number(animeId),
			room_date: roomDate,
			room_session_id: session.id,
			duration_days: duration === "event_end" ? null : duration,
			mute_until_event_end: duration === "event_end",
			muted_until: mutedUntil.toISOString(),
			updated_at: now.toISOString(),
		},
		{ onConflict: "user_id,anime_id" },
	);
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

// linked_accounts は自動生成型未収録のためテーブル名のみ型アサーション使用
export async function linkAccounts(
	serviceClient: SupabaseClient<Database>,
	userIdA: string,
	userIdB: string,
	displayOrderForA: number,
): Promise<void> {
	// biome-ignore lint/suspicious/noExplicitAny: linked_accounts not yet in auto-generated DB types
	await (serviceClient as SupabaseClient<any>).from("linked_accounts").upsert([
		{ owner_user_id: userIdA, linked_user_id: userIdB, display_order: displayOrderForA },
		{ owner_user_id: userIdB, linked_user_id: userIdA, display_order: 0 },
	]);
}
