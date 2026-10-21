import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/159_reject_posts_to_cancelled_sessions.sql", import.meta.url),
	"utf8",
);

describe("cancelled session posts migration (159, #390)", () => {
	const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_post_episode_room()");
	const body = migration.slice(start, migration.indexOf("$$;", start));

	it("放送枠を指定した新しい投稿は、休止した放送日なら拒否する", () => {
		const sessionBranch = body.slice(0, body.indexOf("IF NEW.episode_room_id IS NULL THEN\n        RETURN NEW;"));
		expect(sessionBranch).toContain("TG_OP = 'INSERT'");
		expect(sessionBranch).toContain(
			"public.is_broadcast_room_session_cancelled(session_anime_id, session_room_date)",
		);
		expect(sessionBranch).toContain("'Broadcast room session is cancelled'");
	});

	it("158 の共有ロックと休止した放送枠の除外はそのまま残す", () => {
		expect(body).toContain("WHERE id = NEW.episode_room_id FOR SHARE;");
		expect(body).toContain("AND NOT public.is_broadcast_room_session_cancelled(anime_id, room_date)");
	});
});
