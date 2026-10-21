import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/170_profiles_column_update_grants.sql", import.meta.url),
	"utf8",
);

describe("profiles column update grants migration (170, #236)", () => {
	it("authenticated が直接更新できるのは本人の操作で変える列だけ（username・is_admin などは含めない）", () => {
		expect(migration).toContain("REVOKE UPDATE ON public.profiles FROM anon, authenticated;");
		const grant = migration.match(/GRANT UPDATE \(([^)]+)\) ON public\.profiles TO authenticated;/);
		expect(grant?.[1]?.split(",").map((column) => column.trim())).toEqual([
			"display_name",
			"bio",
			"avatar_url",
			"header_url",
			"list_is_public",
			"is_private",
		]);
	});

	it("新規作成（INSERT）の権限は変えない", () => {
		expect(migration).not.toMatch(/REVOKE\s+(ALL|INSERT)/i);
	});

	it("CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
