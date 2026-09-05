import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/126_security_function_followups.sql", import.meta.url),
	"utf8",
);

describe("security function follow-up migration", () => {
	it("pins the mylist notification function search path", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.notify_on_mylist_status()");
		expect(migration).toContain("SECURITY DEFINER SET search_path = public;");
	});

	it("deduplicates unread mylist status notifications atomically and allows read repeats", () => {
		expect(migration).toContain("LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;");
		expect(migration).toContain("DELETE FROM public.notifications duplicate");
		expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_mylist_dedupe_idx");
		expect(migration).toMatch(/SELECT f\.follower_id,[\s\S]*FROM public\.follows f/);
		expect(migration).toMatch(/ON CONFLICT \(recipient_id, actor_id, mylist_anime_id, mylist_status\)/);
		expect(migration).toMatch(/WHERE type = 'mylist_status' AND NOT read/);
		expect(migration).toContain("once a prior");
	});

	it("rejects anon and non-author like-reaction lookups while retaining repost support", () => {
		expect(migration).toContain("IF action_type IS NULL OR action_type NOT IN ('like', 'repost') THEN");
		expect(migration).toMatch(/auth\.uid\(\) IS NULL OR post_author_id IS DISTINCT FROM auth\.uid\(\)/);
		expect(migration).toMatch(/IF action_type = 'like' THEN[\s\S]*FROM public\.likes/);
		expect(migration).toMatch(/ELSE[\s\S]*FROM public\.reposts/);
		expect(migration).not.toMatch(/post_author_id\s*!=\s*auth\.uid\(\)/);
	});
});
