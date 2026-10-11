import type { SupabaseClient } from "@supabase/supabase-js";
import { getLastSignInAt, hasPasswordProvider } from "$lib/server/auth";
import { createServiceRoleClient } from "$lib/server/supabase-admin";
import type { Database } from "$lib/supabase/database.types";

type AuthUser = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["user"]>;
type AuthSession = NonNullable<Awaited<ReturnType<App.Locals["safeGetSession"]>>["session"]>;

/**
 * 退会は取り消せないので、パスワードを持たない（OAuth のみの）アカウントには
 * 直近のログインを要求する。パスキーの追加と同じ 10 分の窓を使う。
 */
export const DELETE_REAUTH_WINDOW_MS = 10 * 60_000;

/** 退会時に本人のファイルが残るバケット。パスは `<user_id>/...` で統一されている */
export const USER_OWNED_BUCKETS = ["post-images", "profile-avatars", "profile-headers"] as const;

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

/** 1回の列挙で取る件数。SDK の既定は 100 件で、それ以降は明示しないと返らない */
export const STORAGE_LIST_PAGE_SIZE = 1000;

/**
 * `<user_id>/` 配下のファイルをすべて消し、消した件数を返す。失敗したら null。
 *
 * 消すと一覧が縮むので offset は進めず、先頭ページが空になるまで列挙と削除を繰り返す。
 */
async function removeAllUserFiles(
	admin: SupabaseClient<Database>,
	bucket: (typeof USER_OWNED_BUCKETS)[number],
	userId: string,
): Promise<number | null> {
	let removed = 0;
	for (;;) {
		const { data: files, error: listError } = await admin.storage
			.from(bucket)
			.list(userId, { limit: STORAGE_LIST_PAGE_SIZE });
		if (listError) {
			console.error(`deleteAccount: list ${bucket} failed:`, listError);
			return null;
		}
		const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
		if (paths.length === 0) return removed;

		const { data: deleted, error: removeError } = await admin.storage.from(bucket).remove(paths);
		if (removeError) {
			console.error(`deleteAccount: remove ${bucket} failed:`, removeError);
			return null;
		}
		// 1件も消えないなら（サブフォルダ等）同じ一覧が返り続けるので打ち切る
		if (!deleted || deleted.length === 0) {
			console.error(`deleteAccount: remove ${bucket} made no progress for`, paths.length, "entries");
			return null;
		}
		removed += deleted.length;
	}
}

export type DeleteAccountResult =
	| { ok: true; removedFiles: number }
	| { ok: false; reason: "has_room_experiments" | "failed" };

/**
 * アカウントを削除する。
 *
 * profiles.id は auth.users(id) ON DELETE CASCADE なので、投稿・いいね・通知・
 * マイリスト等の行は auth ユーザーの削除で連鎖削除される（142 のコメント参照）。
 * 連鎖で消えないのは Storage のファイルだけなので、先に明示的に消す。
 * （先に消すのは、auth ユーザーが消えた後だと「誰のファイルだったか」を
 *   引く手段が無くなり、消し漏れが残るため）
 */
export async function deleteAccount(
	userId: string,
	options: { initiatedBy?: "self" | "admin"; admin?: SupabaseClient<Database> } = {},
): Promise<DeleteAccountResult> {
	const admin = options.admin ?? createServiceRoleClient();

	// 監査用の集計値（個人を識別する値は残さない）
	const [{ data: moderation }, { count: postCount }] = await Promise.all([
		admin.from("account_moderation").select("status").eq("user_id", userId).maybeSingle(),
		admin.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
	]);

	// 所有ファイルが残っていると auth ユーザーを削除できないため、全バケットを
	// 消し切れたときだけ先へ進む
	let removedFiles = 0;
	for (const bucket of USER_OWNED_BUCKETS) {
		const removed = await removeAllUserFiles(admin, bucket, userId);
		if (removed === null) return { ok: false, reason: "failed" };
		removedFiles += removed;
	}

	const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
	if (deleteError) {
		console.error("deleteAccount: auth.admin.deleteUser failed:", deleteError);
		// room_experiment_runs.created_by の RESTRICT は 142 で SET NULL に変えたが、
		// 未適用の環境では外部キー違反でここに来る。原因が伝わる形で返す。
		if (/foreign key|violates/i.test(deleteError.message)) return { ok: false, reason: "has_room_experiments" };
		return { ok: false, reason: "failed" };
	}

	// biome-ignore lint/suspicious/noExplicitAny: account_deletions not yet in auto-generated DB types
	const { error: auditError } = await (admin as any).from("account_deletions").insert({
		moderation_status: (moderation?.status as string | undefined) ?? "active",
		post_count: postCount ?? 0,
		initiated_by: options.initiatedBy ?? "self",
	});
	// 記録に失敗しても削除自体は完了している。やり直せないので成功として返す。
	if (auditError) console.error("deleteAccount: audit insert failed:", auditError);

	return { ok: true, removedFiles };
}
