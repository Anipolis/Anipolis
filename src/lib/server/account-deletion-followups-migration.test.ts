import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/150_account_deletion_followups.sql", import.meta.url),
	"utf8",
);

describe("account deletion followups migration (150)", () => {
	it.each([
		{ table: "invites", column: "created_by" },
		{ table: "reports", column: "reporter_id" },
	])("退会しても $table を残す（$column を SET NULL にする）", ({ table, column }) => {
		expect(migration).toContain(`ALTER TABLE public.${table}\n    ALTER COLUMN ${column} DROP NOT NULL;`);
		expect(migration).toContain(
			`ADD CONSTRAINT ${table}_${column}_fkey\n    FOREIGN KEY (${column}) REFERENCES public.profiles(id) ON DELETE SET NULL;`,
		);
	});

	it("通報者の制約名はアプリの埋め込み（profiles!reports_reporter_id_fkey）と同じにする", () => {
		expect(migration).toContain("ADD CONSTRAINT reports_reporter_id_fkey");
	});

	it("発行者のいない招待は、本人扱いにならない（NULL を IS DISTINCT FROM で比べる）", () => {
		expect(migration).toContain("target_invite.created_by IS DISTINCT FROM current_user_id");
		expect(migration).not.toMatch(/created_by <> current_user_id/);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated, service_role;",
		);
	});

	it("退会時にユーザー名を保留し、未使用の招待を失効させる（SET NULL より前に BEFORE DELETE で）", () => {
		expect(migration).toMatch(/CREATE TRIGGER handle_profile_deletion\s+BEFORE DELETE ON public\.profiles/);
		expect(migration).toContain("VALUES (lower(OLD.username), now())");
		expect(migration).toMatch(/UPDATE public\.invites\s+SET revoked_at = now\(\)\s+WHERE created_by = OLD\.id/);
	});

	it("保留中の名前での登録・変更を、既存の重複と同じ 23505 で拒否する", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER enforce_username_not_held\s+BEFORE INSERT OR UPDATE OF username ON public\.profiles/,
		);
		expect(migration).toContain("RAISE EXCEPTION 'username is held after account deletion'");
		expect(migration).toContain("ERRCODE = '23505'");
	});

	it("保留は30日で、期限切れの行は消す", () => {
		expect(migration.match(/interval '30 days'/g)?.length).toBeGreaterThanOrEqual(2);
		expect(migration).toContain("PERFORM public.purge_released_usernames();");
		expect(migration).toContain("'purge-released-usernames'");
	});

	it("保留中の名前の一覧はクライアントから読めない", () => {
		expect(migration).toContain("ALTER TABLE public.released_usernames ENABLE ROW LEVEL SECURITY;");
		expect(migration).not.toMatch(/CREATE POLICY[^;]*released_usernames/);
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.is_username_held(text) FROM PUBLIC, anon, authenticated;",
		);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated, service_role;",
		);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
