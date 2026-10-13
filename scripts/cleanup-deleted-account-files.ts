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
const { data: pending, error } = await supabase
	.from("account_storage_cleanups")
	.select("user_id, requested_at, attempts, last_error")
	.order("requested_at");
if (error) throw new Error(error.message);

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${(pending ?? []).length} pending cleanups`);
for (const row of pending ?? []) {
	console.log(`  ${row.user_id} requested ${row.requested_at} attempts ${row.attempts} ${row.last_error ?? ""}`);
}

if (apply && (pending ?? []).length > 0) {
	const result = await retryPendingAccountStorageCleanups(supabase, { limit: (pending ?? []).length });
	console.log(`completed: ${result.completed}, remaining: ${result.remaining}`);
}
