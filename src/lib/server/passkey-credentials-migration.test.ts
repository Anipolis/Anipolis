import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/140_passkey_credentials.sql", import.meta.url),
	"utf8",
);

describe("passkey credentials migration", () => {
	it("RLS を有効にする", () => {
		expect(migration).toContain("ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;");
	});

	it("利用者には閲覧と削除だけを許し、書き込みは service role に限る", () => {
		expect(migration).toContain("REVOKE ALL ON public.passkey_credentials FROM anon, authenticated;");
		expect(migration).toContain("GRANT SELECT, DELETE ON public.passkey_credentials TO authenticated;");
		expect(migration).not.toMatch(/FOR (INSERT|UPDATE|ALL)\b/);
	});

	it("自分の資格情報だけに絞る", () => {
		const ownerCondition = "USING (user_id = (SELECT auth.uid()))";
		expect(migration.match(new RegExp(ownerCondition.replace(/[()]/g, "\\$&"), "g"))).toHaveLength(2);
	});

	it("credential ID は一意にする", () => {
		expect(migration).toContain("credential_id text NOT NULL UNIQUE");
	});
});
