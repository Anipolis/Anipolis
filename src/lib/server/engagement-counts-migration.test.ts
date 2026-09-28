import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/129_drop_post_engagement_counts.sql", import.meta.url),
	"utf8",
);

const generatedTypes = readFileSync(new URL("../supabase/database.types.ts", import.meta.url), "utf8");

describe("post engagement counts removal migration", () => {
	it("drops the unbounded public RPC by its exact signature", () => {
		expect(migration).toContain("DROP FUNCTION IF EXISTS public.get_post_engagement_counts(uuid[]);");
	});

	it("does not recreate or re-grant the function", () => {
		expect(migration).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
		expect(migration).not.toMatch(/GRANT EXECUTE/i);
	});

	it("leaves no client-side reference to the dropped RPC", () => {
		expect(generatedTypes).not.toContain("get_post_engagement_counts");
	});
});
