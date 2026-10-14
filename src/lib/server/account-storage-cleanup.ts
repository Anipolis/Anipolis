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

/** 1回の列挙・削除で扱う件数。SDK の既定は 100 件で、それ以降は明示しないと返らない */
export const STORAGE_LIST_PAGE_SIZE = 1000;

/**
 * 1回の列挙でたどるファイル・フォルダの数の上限（バケットごと）。深さではなく量で区切る（#391）。
 * Storage のポリシー（128）は先頭が本人 ID なら深さに制限なく書き込みを許すので、深さで打ち切ると
 * 深いパスに置かれたファイルがいつまでも消せない。上限に達したら、そこまでに見つけた分を消して列挙し直す
 */
const MAX_LISTED_ENTRIES = 10_000;

/** 1回の後始末で「列挙して消す」を繰り返す回数の上限（ファイルが非常に多い場合は次回の再試行で続ける） */
const MAX_REMOVE_ROUNDS = 5;

/**
 * prefix 配下のファイルのパスを、サブフォルダもたどって集める。失敗したら null。
 * 直下だけを消すとサブフォルダの中身が残る（#388 Codex）。フォルダは再帰ではなく順番待ちの列でたどり、
 * たどった項目が MAX_LISTED_ENTRIES を超えたら complete: false でそこまでの分を返す。
 */
async function listFiles(
	admin: SupabaseClient<Database>,
	bucket: string,
	root: string,
): Promise<{ paths: string[]; complete: boolean } | null> {
	const paths: string[] = [];
	const folders = [root];
	let listed = 0;
	for (let next = 0; next < folders.length; next += 1) {
		const prefix = folders[next] as string;
		for (let offset = 0; ; offset += STORAGE_LIST_PAGE_SIZE) {
			const { data: entries, error } = await admin.storage
				.from(bucket)
				.list(prefix, { limit: STORAGE_LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
			if (error) {
				console.error(`account storage cleanup: list ${bucket}/${prefix} failed:`, error);
				return null;
			}
			for (const entry of entries ?? []) {
				listed += 1;
				if (listed > MAX_LISTED_ENTRIES) return { paths, complete: false };
				const path = `${prefix}/${entry.name}`;
				// id が null の項目はフォルダ（Storage の疑似フォルダ）
				if (entry.id === null) folders.push(path);
				else paths.push(path);
			}
			if ((entries ?? []).length < STORAGE_LIST_PAGE_SIZE) break;
		}
	}
	return { paths, complete: true };
}

/** `<user_id>/` 配下のファイルをサブフォルダも含めてすべて消し、消した件数を返す。失敗・未完了なら null */
async function removeAllUserFiles(
	admin: SupabaseClient<Database>,
	bucket: (typeof USER_OWNED_BUCKETS)[number],
	userId: string,
): Promise<number | null> {
	let removed = 0;
	for (let round = 0; ; round += 1) {
		// 列挙し直して、消し終えたか確かめる（消したはずのファイルが残っていれば失敗として記録を残す）
		const listing = await listFiles(admin, bucket, userId);
		if (listing === null) return null;
		if (listing.complete && listing.paths.length === 0) return removed;
		if (round >= MAX_REMOVE_ROUNDS || listing.paths.length === 0) {
			console.error(`account storage cleanup: files remain in ${bucket} for ${userId}`);
			return null;
		}

		let deletedThisRound = 0;
		for (let start = 0; start < listing.paths.length; start += STORAGE_LIST_PAGE_SIZE) {
			const chunk = listing.paths.slice(start, start + STORAGE_LIST_PAGE_SIZE);
			const { data: deleted, error } = await admin.storage.from(bucket).remove(chunk);
			if (error) {
				console.error(`account storage cleanup: remove ${bucket} failed:`, error);
				return null;
			}
			deletedThisRound += deleted?.length ?? 0;
		}
		// 消しても減らないなら繰り返さない（同じ列挙と削除を空回りさせない）
		if (deletedThisRound === 0) {
			console.error(`account storage cleanup: ${listing.paths.length} files could not be removed from ${bucket}`);
			return null;
		}
		removed += deletedThisRound;
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

/** 退会をやめた（auth ユーザーが残っている）ときに記録を外す */
export async function cancelAccountStorageCleanup(admin: SupabaseClient<Database>, userId: string): Promise<void> {
	const { error } = await admin.from("account_storage_cleanups").delete().eq("user_id", userId);
	if (error) console.error("account storage cleanup: cancel failed:", error);
}

/**
 * auth ユーザーがまだ存在するか。true = 存在する / false = 存在しない（404）/ null = 確かめられない。
 * 退会の結果が曖昧なとき（削除のエラーが通信の失敗だった等）と、やり直しの前に使う。
 */
export async function authUserExists(admin: SupabaseClient<Database>, userId: string): Promise<boolean | null> {
	const { data, error } = await admin.auth.admin.getUserById(userId);
	if (data?.user) return true;
	if (error && (error.status === 404 || /not.?found/i.test(error.message))) return false;
	return error ? null : false;
}

/** 試行の記録を更新する（失敗した記録が次の回で後ろに回るように last_attempt_at を進める） */
async function markAttempt(admin: SupabaseClient<Database>, userId: string, lastError: string): Promise<void> {
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
			last_error: lastError,
		})
		.eq("user_id", userId);
	if (error) console.error("account storage cleanup: update record failed:", error);
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

	await markAttempt(admin, userId, `failed buckets: ${failedBuckets.join(", ")}`);
	return { ok: false, removedFiles };
}

/** 退会の途中（auth ユーザーの削除前後）の記録には触れない。これより古い記録だけをやり直す */
const RETRY_AFTER_MS = 10 * 60_000;

/**
 * 残っている記録を limit 件やり直す。消し終えた件数と残った件数を返す。
 *   * 未試行のものから、次に最後の試行が古いものから選ぶ。失敗し続ける記録が先頭に居座って、
 *     後ろの消せる記録に届かなくならないように（#388 Codex）
 *   * auth ユーザーがまだ存在する記録は退会が完了していないので、ファイルを消さない
 *     （消してしまうと、アカウントが残ったまま画像だけ失われる）
 */
export async function retryPendingAccountStorageCleanups(
	admin: SupabaseClient<Database>,
	options: { limit: number; excludeUserId?: string; now?: number },
): Promise<{ completed: number; remaining: number; processed: number }> {
	const now = options.now ?? Date.now();
	let query = admin
		.from("account_storage_cleanups")
		.select("user_id, requested_at")
		.lt("requested_at", new Date(now - RETRY_AFTER_MS).toISOString())
		.order("last_attempt_at", { ascending: true, nullsFirst: true })
		.order("requested_at", { ascending: true })
		.limit(options.limit);
	if (options.excludeUserId) query = query.neq("user_id", options.excludeUserId);
	const { data, error } = await query;
	if (error) {
		console.error("account storage cleanup: list pending failed:", error);
		return { completed: 0, remaining: 0, processed: 0 };
	}
	let completed = 0;
	let remaining = 0;
	for (const row of data ?? []) {
		const exists = await authUserExists(admin, row.user_id);
		if (exists === true) {
			// 退会は完了していない。記録は外さずに後ろへ回す（存在を確かめた直後に退会が完了する競合で、
			// やり直しの手がかりを消してしまわないように。#388 Codex）
			await markAttempt(admin, row.user_id, "auth user still exists");
			continue;
		}
		if (exists === null) {
			// 存在を確かめられないときは消さない（次の回で後ろに回す）
			await markAttempt(admin, row.user_id, "could not confirm the auth user was deleted");
			remaining += 1;
			continue;
		}
		const result = await runAccountStorageCleanup(admin, row.user_id);
		if (result.ok) completed += 1;
		else remaining += 1;
	}
	return { completed, remaining, processed: (data ?? []).length };
}
