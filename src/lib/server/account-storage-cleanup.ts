import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";

/**
 * 退会したアカウントの Storage のファイルを消す（#383 / #388 の Codex レビュー）。
 *
 * 退会は auth ユーザーを先に削除し、その後でファイルを消す（account-deletion.ts）。ファイルの削除が
 * 一時的に失敗しても、本人はもう再試行できないので、削除する利用者 ID を account_storage_cleanups
 * （migration 154）に先に記録し、消し終えるまでやり直す。
 *   * 退会のたびに、残っている分を少しだけやり直す
 *   * scripts/cleanup-deleted-account-files.ts で残りをまとめて消せる
 *
 * スクリプトからも読み込むので、$lib の別名は使わない（型の import は実行時に消える）。
 */

/** 退会時に本人のファイルが残るバケット。パスは `<user_id>/...` で統一されている */
export const USER_OWNED_BUCKETS = ["post-images", "profile-avatars", "profile-headers"] as const;

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
			console.error(`account storage cleanup: list ${bucket} failed:`, listError);
			return null;
		}
		const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
		if (paths.length === 0) return removed;

		const { data: deleted, error: removeError } = await admin.storage.from(bucket).remove(paths);
		if (removeError) {
			console.error(`account storage cleanup: remove ${bucket} failed:`, removeError);
			return null;
		}
		// 1件も消えないなら（サブフォルダ等）同じ一覧が返り続けるので打ち切る
		if (!deleted || deleted.length === 0) {
			console.error(`account storage cleanup: remove ${bucket} made no progress for`, paths.length, "entries");
			return null;
		}
		removed += deleted.length;
	}
}

/** 消す予定として記録する。記録できなければ false（退会を始めない） */
export async function recordAccountStorageCleanup(admin: SupabaseClient<Database>, userId: string): Promise<boolean> {
	const { error } = await admin
		.from("account_storage_cleanups")
		.upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
	if (error) console.error("account storage cleanup: record failed:", error);
	return !error;
}

/** 退会をやめた（auth ユーザーの削除に失敗した）ときに記録を外す */
export async function cancelAccountStorageCleanup(admin: SupabaseClient<Database>, userId: string): Promise<void> {
	const { error } = await admin.from("account_storage_cleanups").delete().eq("user_id", userId);
	if (error) console.error("account storage cleanup: cancel failed:", error);
}

/**
 * 記録した利用者のファイルを全バケットから消す。全部消せたら記録を外し、どれかが失敗したら
 * 記録を残して試行回数と最後のエラーを更新する（次の機会にやり直す）。
 */
export async function runAccountStorageCleanup(
	admin: SupabaseClient<Database>,
	userId: string,
): Promise<{ ok: boolean; removedFiles: number }> {
	let removedFiles = 0;
	const failedBuckets: string[] = [];
	for (const bucket of USER_OWNED_BUCKETS) {
		const removed = await removeAllUserFiles(admin, bucket, userId);
		if (removed === null) failedBuckets.push(bucket);
		else removedFiles += removed;
	}

	if (failedBuckets.length === 0) {
		const { error } = await admin.from("account_storage_cleanups").delete().eq("user_id", userId);
		if (error) console.error("account storage cleanup: clear record failed:", error);
		return { ok: true, removedFiles };
	}

	const { data: current } = await admin
		.from("account_storage_cleanups")
		.select("attempts")
		.eq("user_id", userId)
		.maybeSingle();
	const { error } = await admin
		.from("account_storage_cleanups")
		.update({
			attempts: (current?.attempts ?? 0) + 1,
			last_attempt_at: new Date().toISOString(),
			last_error: `failed buckets: ${failedBuckets.join(", ")}`,
		})
		.eq("user_id", userId);
	if (error) console.error("account storage cleanup: update record failed:", error);
	return { ok: false, removedFiles };
}

/** 退会の途中（auth ユーザーの削除前後）の記録には触れない。これより古い記録だけをやり直す */
const RETRY_AFTER_MS = 10 * 60_000;
/** auth ユーザーが残ったままの記録（削除が失敗し、記録を外すのにも失敗した）を外すまでの時間 */
const STALE_RECORD_MS = 24 * 60 * 60_000;

/**
 * 残っている記録を古い順に limit 件やり直す。消し終えた件数と残った件数を返す。
 * auth ユーザーがまだ存在する記録は退会が完了していないので、ファイルを消さない
 * （消してしまうと、アカウントが残ったまま画像だけ失われる）。
 */
export async function retryPendingAccountStorageCleanups(
	admin: SupabaseClient<Database>,
	options: { limit: number; excludeUserId?: string; now?: number },
): Promise<{ completed: number; remaining: number }> {
	const now = options.now ?? Date.now();
	let query = admin
		.from("account_storage_cleanups")
		.select("user_id, requested_at")
		.lt("requested_at", new Date(now - RETRY_AFTER_MS).toISOString())
		.order("requested_at", { ascending: true })
		.limit(options.limit);
	if (options.excludeUserId) query = query.neq("user_id", options.excludeUserId);
	const { data, error } = await query;
	if (error) {
		console.error("account storage cleanup: list pending failed:", error);
		return { completed: 0, remaining: 0 };
	}
	let completed = 0;
	let remaining = 0;
	for (const row of data ?? []) {
		const { data: found, error: lookupError } = await admin.auth.admin.getUserById(row.user_id);
		if (found?.user) {
			// 退会は完了していない。古い記録なら外す（ファイルはアカウントのものとして残す）
			if (now - Date.parse(row.requested_at) > STALE_RECORD_MS)
				await cancelAccountStorageCleanup(admin, row.user_id);
			continue;
		}
		const notFound = lookupError && (lookupError.status === 404 || /not.?found/i.test(lookupError.message));
		if (lookupError && !notFound) {
			// 存在を確かめられないときは消さない
			remaining += 1;
			continue;
		}
		const result = await runAccountStorageCleanup(admin, row.user_id);
		if (result.ok) completed += 1;
		else remaining += 1;
	}
	return { completed, remaining };
}
