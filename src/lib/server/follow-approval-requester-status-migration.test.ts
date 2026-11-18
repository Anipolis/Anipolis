import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/205_follow_approval_checks_requester_status.sql", import.meta.url),
	"utf8",
);
const fn =
	/CREATE OR REPLACE FUNCTION public\.is_pending_follow_requester_active[\s\S]*?\$\$;/.exec(migration)?.[0] ?? "";
const policy = /CREATE POLICY "follows_insert_active_users"[\s\S]*?;/.exec(migration)?.[0] ?? "";

describe("follow approval checks requester status migration (#379)", () => {
	it("申請者の状態は RLS に左右されない SECURITY DEFINER の関数で、真偽値だけを返す", () => {
		expect(fn).toContain("RETURNS boolean");
		expect(fn).toContain("SECURITY DEFINER");
		expect(fn).toContain("SET search_path = public");
		expect(fn).not.toMatch(/restricted_until\s*,|reason|SELECT am\.\*/);
	});

	it("自分宛ての保留中の申請がある相手についてだけ答える", () => {
		expect(fn).toMatch(
			/fr\.requester_id = requester\s+AND fr\.target_id = auth\.uid\(\)\s+AND fr\.status = 'pending'/,
		);
	});

	it("判定は is_profile_active_for_writes と同じ（停止は不可・期限切れの制限は可・行が無ければ可）", () => {
		expect(fn).toMatch(/am\.status = 'active'\s+OR \(\s+am\.status = 'restricted'/);
		expect(fn).toContain("am.restricted_until <= now()");
		expect(fn).toMatch(/\),\s+true\s+\);/);
	});

	it("PUBLIC と anon からは実行させない", () => {
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.is_pending_follow_requester_active(uuid) FROM PUBLIC, anon;",
		);
		expect(migration).toMatch(
			/GRANT EXECUTE ON FUNCTION public\.is_pending_follow_requester_active\(uuid\) TO authenticated, service_role;/,
		);
	});

	it("承認の枝にだけ申請者の状態の検査を足し、195 の条件はそのまま残す", () => {
		expect(policy).toMatch(
			/auth\.uid\(\) = following_id[\s\S]*?fr\.status = 'pending'\s+\)\s+AND public\.is_pending_follow_requester_active\(follower_id\)\s+\)/,
		);
		expect(policy).toMatch(/auth\.uid\(\) = follower_id\s+AND EXISTS \(\s+SELECT 1\s+FROM public\.profiles target/);
		expect(policy).toContain("AND public.is_profile_active_for_writes(follower_id)");
		expect(policy).toContain("AND public.has_beta_write_access()");
		expect(policy).toContain("AND NOT public.is_blocked_between(follower_id, following_id)");
	});

	it("ほかの INSERT ポリシーが OR で残らないよう、作り直す前にすべて外す", () => {
		const dropAll = migration.indexOf("EXECUTE format('DROP POLICY %I ON public.follows', policy_name)");
		expect(dropAll).toBeGreaterThan(-1);
		expect(dropAll).toBeLessThan(migration.indexOf('CREATE POLICY "follows_insert_active_users"'));
		expect(migration.match(/CREATE POLICY/g)).toHaveLength(1);
	});
});
