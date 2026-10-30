import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/176_email_signup_uses_onboarding.sql", import.meta.url),
	"utf8",
);
const statements = migration
	.split("\n")
	.filter((line) => !line.startsWith("--"))
	.join("\n");

describe("email signup uses onboarding migration (176)", () => {
	it("メールの登録で profiles を作るトリガーと関数を消す", () => {
		expect(statements).toContain("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;");
		expect(statements).toContain("DROP FUNCTION IF EXISTS public.handle_new_user();");
	});

	it("既存のプロフィールには触れない", () => {
		expect(statements).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE|INSERT)\b/i);
		expect(statements).not.toMatch(/DROP TABLE/i);
	});
});
