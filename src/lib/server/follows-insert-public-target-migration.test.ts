import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/195_follows_insert_requires_public_target.sql", import.meta.url),
	"utf8",
);
const policy = /CREATE POLICY "follows_insert_active_users"[\s\S]*?;/.exec(migration)?.[0] ?? "";

describe("follows insert requires public target migration", () => {
	it("フォローする側の枝は、相手が公開アカウントのときだけ通す", () => {
		expect(policy).toMatch(
			/auth\.uid\(\) = follower_id\s+AND EXISTS \(\s+SELECT 1\s+FROM public\.profiles target\s+WHERE target\.id = following_id\s+AND target\.is_private = false\s+\)/,
		);
		// 条件の無い「自分がフォローする側なら通す」枝を残さない
		expect(policy).not.toMatch(/auth\.uid\(\) = follower_id\s+OR/);
	});

	it("鍵アカウントへは、相手本人が保留中の申請に対して作るときだけ通す", () => {
		expect(policy).toMatch(
			/auth\.uid\(\) = following_id\s+AND EXISTS \(\s+SELECT 1\s+FROM public\.follow_requests fr\s+WHERE fr\.requester_id = follower_id\s+AND fr\.target_id = following_id\s+AND fr\.status = 'pending'\s+\)/,
		);
	});

	it("141 までの条件（アカウント状態・β・ブロック）を落とさない", () => {
		expect(policy).toContain("AND public.is_profile_active_for_writes(follower_id)");
		expect(policy).toContain("AND public.has_beta_write_access()");
		expect(policy).toContain("AND NOT public.is_blocked_between(follower_id, following_id)");
	});

	it("ほかの INSERT ポリシーが残って OR で通らないよう、作り直す前にすべて外す", () => {
		const dropAll = migration.indexOf("EXECUTE format('DROP POLICY %I ON public.follows', policy_name)");
		expect(dropAll).toBeGreaterThan(-1);
		expect(migration).toMatch(/WHERE polrelid = 'public\.follows'::regclass\s+AND polcmd = 'a'/);
		expect(dropAll).toBeLessThan(migration.indexOf('CREATE POLICY "follows_insert_active_users"'));
		expect(migration.match(/CREATE POLICY/g)).toHaveLength(1);
	});
});
