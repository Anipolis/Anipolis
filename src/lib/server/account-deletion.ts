import type { SupabaseClient } from "@supabase/supabase-js";
import {
	authUserExists,
	cancelAccountStorageCleanup,
	recordAccountStorageCleanup,
	retryPendingAccountStorageCleanups,
	runAccountStorageCleanup,
} from "$lib/server/account-storage-cleanup";
import { getLastSignInAt, hasPasswordProvider } from "$lib/server/auth";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Database } from "$lib/supabase/database.types";

export { STORAGE_LIST_PAGE_SIZE, USER_OWNED_BUCKETS } from "$lib/server/account-storage-cleanup";

type AuthUser = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>;
type AuthSession = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"]>;

/**
 * 退会は取り消せないので、パスワードを持たない（OAuth のみの）アカウントには
 * 直近のログインを要求する。パスキーの追加と同じ 10 分の窓を使う。
 */
export const DELETE_REAUTH_WINDOW_MS = 10 * 60_000;

export function isRecentlyAuthenticated(session: AuthSession | null, now = Date.now()): boolean {
	const signedInAt = getLastSignInAt(session);
	return signedInAt !== null && now - signedInAt <= DELETE_REAUTH_WINDOW_MS;
}

export type DeletionGate =
	| { ok: true; needsPassword: boolean }
	| { ok: false; reason: "reauth_required" | "username_mismatch" | "password_required" };

/**
 * 退会を実行してよいかを判定する。副作用なし。
 *
 * - 入力されたユーザー名が自分のものと一致すること（誤操作と誤クリックの防止）
 * - パスワードを持つアカウントはパスワードの再入力（確認は呼び出し側で行う）
 * - パスワードを持たないアカウントは直近 10 分以内のログイン
 */
export function checkDeletionGate(input: {
	user: AuthUser;
	session: AuthSession | null;
	username: string;
	confirmation: string;
	now?: number;
}): DeletionGate {
	const { user, session, username, confirmation } = input;
	if (confirmation.trim().toLowerCase() !== username.trim().toLowerCase()) {
		return { ok: false, reason: "username_mismatch" };
	}

	if (hasPasswordProvider(user, session)) return { ok: true, needsPassword: true };

	if (!isRecentlyAuthenticated(session, input.now ?? Date.now())) {
		return { ok: false, reason: "reauth_required" };
	}
	return { ok: true, needsPassword: false };
}

export type DeleteAccountResult =
	| { ok: true; removedFiles: number }
	| { ok: false; reason: "has_room_experiments" | "failed" };

/** 退会のたびに、前の退会で消し残したファイルをやり直す件数（退会の応答を遅くしすぎない範囲） */
const RETRY_PENDING_CLEANUPS_PER_DELETION = 3;

/**
 * アカウントを削除する。
 *
 * profiles.id は auth.users(id) ON DELETE CASCADE なので、投稿・いいね・通知・
 * マイリスト等の行は auth ユーザーの削除で連鎖削除される（142 のコメント参照）。
 * 連鎖で消えないのは Storage のファイルだけなので、auth ユーザーを消した後に消す。
 *
 * 順番は「消す予定の記録 → auth ユーザー → ファイル」。
 *   * Storage のファイルが残っていても auth ユーザーは削除できる（2026-10-14 本番で確認）。逆の順番だと、
 *     auth ユーザーの削除が失敗したときにアカウントと投稿は残ったまま画像だけが失われる（#383 Codex）
 *   * ファイルの削除が一時的に失敗しても本人は再試行できないので、利用者 ID を account_storage_cleanups
 *     （154）に先に記録し、消し終えるまでやり直す（#388 Codex。account-storage-cleanup.ts）
 */
export async function deleteAccount(
	userId: string,
	options: { initiatedBy?: "self" | "admin"; admin?: SupabaseClient<Database> } = {},
): Promise<DeleteAccountResult> {
	const admin = options.admin ?? createServiceRoleClient();

	// 監査用の集計値（個人を識別する値は残さない）。削除の前に取る
	const [{ data: moderation }, { count: postCount }] = await Promise.all([
		admin.from("account_moderation").select("status").eq("user_id", userId).maybeSingle(),
		admin.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
	]);

	// ファイルを消し終えるまでやり直せるよう、先に記録する。記録できなければ退会を始めない
	if (!(await recordAccountStorageCleanup(admin, userId))) return { ok: false, reason: "failed" };

	const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
	if (deleteError) {
		console.error("deleteAccount: auth.admin.deleteUser failed:", deleteError);
		// 応答が通信の失敗などで失われても、サーバー側では削除が済んでいることがある。存否を確かめて決める（#388 Codex）
		const exists = await authUserExists(admin, userId);
		if (exists === null) {
			// 確かめられない。記録は残し（auth ユーザーが消えていれば、やり直しの処理が後でファイルを消す）、失敗を返す
			return { ok: false, reason: "failed" };
		}
		if (exists) {
			// 削除されていない。記録を外してファイルには触れない
			await cancelAccountStorageCleanup(admin, userId);
			// room_experiment_runs.created_by の RESTRICT は 142 で SET NULL に変えたが、
			// 未適用の環境では外部キー違反でここに来る。原因が伝わる形で返す。
			if (/foreign key|violates/i.test(deleteError.message)) return { ok: false, reason: "has_room_experiments" };
			return { ok: false, reason: "failed" };
		}
		// auth ユーザーは消えている（エラーは応答だけの失敗）。退会は完了しているので続ける
	}

	// 消し残しは記録が残り、次の退会や scripts/cleanup-deleted-account-files.ts でやり直す
	const { removedFiles } = await runAccountStorageCleanup(admin, userId);

	const { error: auditError } = await admin.from("account_deletions").insert({
		moderation_status: (moderation?.status as string | undefined) ?? "active",
		post_count: postCount ?? 0,
		initiated_by: options.initiatedBy ?? "self",
	});
	// 記録に失敗しても削除自体は完了している。やり直せないので成功として返す。
	if (auditError) console.error("deleteAccount: audit insert failed:", auditError);

	// 前の退会で消し残したファイルを少しだけやり直す（失敗しても今回の退会には影響しない）
	await retryPendingAccountStorageCleanups(admin, {
		limit: RETRY_PENDING_CLEANUPS_PER_DELETION,
		excludeUserId: userId,
	}).catch((error) => console.error("deleteAccount: retry pending cleanups failed:", error));

	return { ok: true, removedFiles };
}
