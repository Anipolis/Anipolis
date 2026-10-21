import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/169_profiles_db_contract.sql", import.meta.url),
	"utf8",
);

describe("profiles db contract migration (169, #236)", () => {
	it("画面と同じ決まりを CHECK 制約にする", () => {
		expect(migration).toContain("ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')");
		expect(migration).toContain(
			"ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 50)",
		);
		expect(migration).toContain(
			"ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160)",
		);
	});

	it("更新できる列を絞る変更は含めない（本番のアプリの切り替え後に別の migration で行う）", () => {
		expect(migration).not.toMatch(/REVOKE|GRANT/);
	});

	it("メールの登録で送られた表示名は 50 文字に切ってから入れる", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
		expect(migration).toContain(
			"left(COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', final_username), 50)",
		);
		// 161 の版のまま: ID は小文字・20 文字まで
		expect(migration).toContain("base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g'));");
		expect(migration).toContain("base_username := left(base_username, 20);");
	});

	it("CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
