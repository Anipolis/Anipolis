import { createClient } from "@supabase/supabase-js";
import { retryPendingAccountStorageCleanups } from "../src/lib/server/account-storage-cleanup.ts";

// 退会したアカウントで消し残した Storage のファイルを消す（#388）。
//
// 退会は auth ユーザーを削除してから Storage のファイルを消す。ファイルの削除が失敗した利用者は
// account_storage_cleanups（migration 154）に残り、退会のたびに数件ずつやり直されるが、
// 退会が少ない間はここでまとめて消す。auth ユーザーがまだ存在する記録（退会が完了していない）は消さない。
//
//   pnpm cleanup:deleted-account-files            # 残っている件数を見るだけ
//   pnpm cleanup:deleted-account-files -- --apply # 消す

const apply = process.argv.includes("--apply");

function getSupabaseClient() {
	const supabaseUrl = process.env["PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
	const secretKey = process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
	if (!supabaseUrl || !secretKey) {
		throw new Error(
			"Set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
		);
	}
	return createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const supabase = getSupabaseClient();

// PostgREST の上限（本番 1000 件）で切れないよう、ページを追って全件を見る
const PAGE_SIZE = 1000;
const pending: { user_id: string; requested_at: string; attempts: number; last_error: string | null }[] = [];
for (let from = 0; ; from += PAGE_SIZE) {
	const { data, error } = await supabase
		.from("account_storage_cleanups")
		.select("user_id, requested_at, attempts, last_error")
		.order("requested_at")
		.order("user_id")
		.range(from, from + PAGE_SIZE - 1);
	if (error) throw new Error(error.message);
	pending.push(...(data ?? []));
	if ((data ?? []).length < PAGE_SIZE) break;
}

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${pending.length} pending cleanups`);
for (const row of pending) {
	console.log(`  ${row.user_id} requested ${row.requested_at} attempts ${row.attempts} ${row.last_error ?? ""}`);
}

if (apply && pending.length > 0) {
	// 200件ずつ選んでやり直す。失敗した記録は次の回で後ろに回るので、今ある記録の数だけ処理すれば
	// 一巡する（失敗が続く記録で止まらず、後ろの消せる記録にも届く）
	let completed = 0;
	let processed = 0;
	while (processed < pending.length) {
		const result = await retryPendingAccountStorageCleanups(supabase, { limit: 200 });
		if (result.processed === 0) break;
		completed += result.completed;
		processed += result.processed;
	}
	const { count } = await supabase.from("account_storage_cleanups").select("user_id", { count: "exact", head: true });
	console.log(`processed: ${processed}, completed: ${completed}, still pending: ${count ?? "?"}`);
}
