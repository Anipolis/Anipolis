import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/161_profile_username_case_insensitive.sql", import.meta.url),
	"utf8",
);

describe("profile username case migration (161)", () => {
	it("OAuth の利用者には作成時にプロフィールを作らず（083 の版）、メールの登録の ID は小文字にする", () => {
		expect(migration).toContain("IF COALESCE(new.raw_app_meta_data->>'provider', 'email') <> 'email'");
		expect(migration).toContain("base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g'));");
	});

	it("既存の ID を小文字にしてから、大文字・小文字を区別しない一意のインデックスを作る", () => {
		const update = migration.indexOf("UPDATE public.profiles SET username = lower(username)");
		const index = migration.indexOf(
			"CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));",
		);
		expect(update).toBeGreaterThan(0);
		expect(index).toBeGreaterThan(update);
	});
});
