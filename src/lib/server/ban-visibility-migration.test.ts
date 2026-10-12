import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/146_ban_visibility_definer.sql", import.meta.url),
	"utf8",
);

function functionBody(name: string): string {
	const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
	return migration.slice(start, migration.indexOf("$$;", start));
}

describe("ban visibility migration (146, #315)", () => {
	it("BAN の判定は account_moderation の RLS を越えて読む SECURITY DEFINER 関数で行う", () => {
		const fn = functionBody("is_profile_banned");
		expect(fn).toMatch(/RETURNS boolean/);
		expect(fn).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = public/);
		expect(fn).toMatch(/am\.user_id = profile_id[\s\S]*?am\.status = 'banned'/);
		// 返すのは真偽値だけ。理由などの列は読まない
		expect(fn).not.toMatch(/reason|restricted_until|moderator|admin_id/);
		expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.is_profile_banned\(uuid\) FROM PUBLIC/);
		expect(migration).toMatch(
			/GRANT EXECUTE ON FUNCTION public\.is_profile_banned\(uuid\) TO anon, authenticated, service_role/,
		);
	});

	it("can_view_profile_content は呼び出し元の権限で account_moderation を読まない", () => {
		const fn = functionBody("can_view_profile_content");
		expect(fn).not.toContain("account_moderation");
		expect(fn).toContain("NOT public.is_profile_banned(profile_id)");
		// 本人と管理者は BAN 後も見られる
		expect(fn).toMatch(
			/NOT public\.is_profile_banned\(profile_id\)\s+OR public\.is_current_user_admin\(\)\s+OR profile_id = auth\.uid\(\)/,
		);
	});

	it("141 までの条件（鍵アカウント・フォロワー・管理者・ブロック）を落としていない", () => {
		const fn = functionBody("can_view_profile_content");
		expect(fn).toMatch(/p\.is_private = false/);
		expect(fn).toMatch(/f\.follower_id = auth\.uid\(\)\s+AND f\.following_id = profile_id/);
		expect(fn).toContain("AND NOT public.is_blocked_between(auth.uid(), profile_id)");
		// 呼び出し元の権限のまま（関数全体を DEFINER にすると profiles/follows の RLS まで越えてしまう）
		expect(fn.slice(0, fn.indexOf("AS $$"))).not.toMatch(/SECURITY DEFINER/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
