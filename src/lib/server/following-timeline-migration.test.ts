import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/127_following_timeline_rpc.sql", import.meta.url),
	"utf8",
);

describe("following timeline migration", () => {
	it("keeps the follows join and timeline merge inside an authenticated RPC", () => {
		expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_following_timeline(");
		expect(migration).toContain("SECURITY INVOKER");
		expect(migration).toContain("f.follower_id = auth.uid()");
		expect(migration).toContain("JOIN public.posts p ON p.user_id = f.following_id");
		expect(migration).toContain("JOIN public.reposts r ON r.user_id = f.following_id");
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.get_following_timeline(integer, timestamptz, uuid) TO authenticated;",
		);
	});

	it("uses a bounded keyset query and preserves the newest event for each post", () => {
		expect(migration).toContain("SELECT DISTINCT ON (post_id)");
		expect(migration).toContain("ORDER BY post_id, timeline_created_at DESC, event_kind ASC");
		expect(migration).toContain("timeline_created_at < p_before");
		expect(migration).toContain("AND post_id < p_before_id");
		expect(migration).toContain("LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);");
		expect(migration).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS reposts_user_created_idx");
	});
});
