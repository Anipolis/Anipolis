import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/154_block_check_hardening.sql", import.meta.url),
	"utf8",
);

describe("block check hardening migration (154, #383 Codex レビュー)", () => {
	it("クライアントからのブロック判定は、呼び出した本人が当事者の組だけ", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_blocked_between(user_a uuid, user_b uuid)");
		expect(migration).toMatch(
			/WHEN COALESCE\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\)\s+AND auth\.uid\(\) IS DISTINCT FROM user_a\s+AND auth\.uid\(\) IS DISTINCT FROM user_b THEN false/,
		);
		// RLS の式から呼ぶので実行権限は今どおり
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO anon, authenticated, service_role;",
		);
	});

	it("おすすめの送信は DB でもブロックした相手には拒否する", () => {
		expect(migration).toMatch(
			/CREATE POLICY "anime_recommendations: users can insert own recommendations"[\s\S]*AND NOT public\.is_blocked_between\(recommender_id, recipient_id\)/,
		);
		// 130 の条件はそのまま残す
		expect(migration).toContain("AND public.is_profile_active_for_writes(recommender_id)");
	});

	it("退会したアカウントの Storage の後始末を記録する表は service role だけ（RLS 有効・ポリシー無し）", () => {
		expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.account_storage_cleanups");
		expect(migration).toContain("ALTER TABLE public.account_storage_cleanups ENABLE ROW LEVEL SECURITY;");
		expect(migration).not.toMatch(/CREATE POLICY[^;]*account_storage_cleanups/);
	});
});
