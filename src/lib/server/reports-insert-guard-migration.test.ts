import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/168_reports_insert_guard.sql", import.meta.url),
	"utf8",
);

describe("reports insert guard migration (168, #237)", () => {
	it("利用者からの INSERT だけを対象にし、service role はそのまま通す", () => {
		expect(migration).toContain("IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN");
		expect(migration).toMatch(
			/BEFORE INSERT ON public\.reports\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.enforce_report_insert_defaults\(\)/,
		);
	});

	it("状態・解決情報・時刻はクライアントの値を使わずに決める", () => {
		expect(migration).toContain("NEW.status := 'open';");
		expect(migration).toContain("NEW.resolved_by := NULL;");
		expect(migration).toContain("NEW.resolved_at := NULL;");
		expect(migration).toContain("NEW.created_at := now();");
		expect(migration).toContain("NEW.updated_at := now();");
	});

	it("target_user_id は対象から導き、対象が無ければ拒否する", () => {
		expect(migration).toContain(
			"SELECT p.user_id INTO target_owner FROM public.posts AS p WHERE p.id = NEW.target_id;",
		);
		expect(migration).toContain(
			"SELECT pr.id INTO target_owner FROM public.profiles AS pr WHERE pr.id = NEW.target_id;",
		);
		expect(migration).toContain("NEW.target_user_id := target_owner;");
		expect(migration).toMatch(/RAISE EXCEPTION 'report_target_not_found'\s+USING ERRCODE = '23503'/);
	});

	it("見えない投稿の有無を探らせないよう、呼び出した人の権限（RLS）で対象を確かめる", () => {
		expect(migration).toContain("SECURITY INVOKER");
		expect(migration).not.toContain("SECURITY DEFINER");
	});

	it("CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
