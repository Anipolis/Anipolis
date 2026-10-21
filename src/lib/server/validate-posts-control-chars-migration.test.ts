import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/174_validate_posts_content_no_control_chars.sql", import.meta.url),
	"utf8",
);

describe("validate posts control chars migration (174, #245)", () => {
	it("173 の CHECK を検査済みにするだけ", () => {
		expect(migration).toContain("ALTER TABLE public.posts VALIDATE CONSTRAINT posts_content_no_control_chars;");
		expect(migration).not.toMatch(/DELETE|UPDATE\s+public\.posts|DROP/i);
	});
});
