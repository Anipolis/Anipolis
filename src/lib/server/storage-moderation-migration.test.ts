import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/128_storage_write_moderation.sql", import.meta.url),
	"utf8",
);

const policies = [
	{ name: "authenticated users can upload post images", command: "INSERT", bucket: "post-images" },
	{ name: "authenticated users can upload their own avatar", command: "INSERT", bucket: "profile-avatars" },
	{ name: "users can update their own avatar", command: "UPDATE", bucket: "profile-avatars" },
	{ name: "users can upload their own profile header", command: "INSERT", bucket: "profile-headers" },
	{ name: "users can update their own profile header", command: "UPDATE", bucket: "profile-headers" },
];

function policyBody(name: string) {
	const start = migration.indexOf(`CREATE POLICY "${name}"`);
	expect(start).toBeGreaterThanOrEqual(0);
	const end = migration.indexOf(");", start);
	return migration.slice(start, end);
}

describe("storage write moderation migration", () => {
	it.each(policies)("rejects restricted accounts in $name", ({ name, command, bucket }) => {
		expect(migration).toContain(`DROP POLICY IF EXISTS "${name}" ON storage.objects;`);
		const body = policyBody(name);
		expect(body).toContain(`FOR ${command}`);
		expect(body).toContain("TO authenticated");
		expect(body).toContain(`bucket_id = '${bucket}'`);
		expect(body).toContain("auth.uid()::text = (storage.foldername(name))[1]");
		expect(body).toContain("public.has_beta_write_access()");
		expect(body).toContain("public.is_profile_active_for_writes(auth.uid())");
	});

	it("leaves delete policies untouched so restricted users can still remove their own images", () => {
		expect(migration).not.toMatch(/FOR DELETE/);
	});
});
