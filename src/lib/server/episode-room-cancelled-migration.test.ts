import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/156_episode_room_cancelled_airings.sql", import.meta.url),
	"utf8",
);

describe("episode room cancelled airings migration (156, #387 Codex)", () => {
	it("開く時刻は休止していない放送枠から計算し、全部休止ならまだ開いていないルームを未定に戻す", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.refresh_episode_room_opens_at(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date)");
		expect(body).toMatch(/SET opens_at = NULL[\s\S]*AND NOT opens_at_locked[\s\S]*AND opens_at > now\(\)/);
	});

	it("休止の登録・変更・削除のたびに、その日の放送枠のルームを計算し直す", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER broadcast_room_overrides_refresh_episode_rooms\s+AFTER INSERT OR UPDATE OF is_cancelled, anime_id, room_date OR DELETE/,
		);
	});

	it("ensure_episode_room は休止した放送枠を放送済みに数えず、話数は 9999 まで", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.ensure_episode_room(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("AND NOT public.is_broadcast_room_session_cancelled(s.anime_id, s.room_date);");
		expect(body).toContain("p_episode_number > 9999");
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.ensure_episode_room(integer, integer) TO authenticated, service_role;",
		);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});

	it("投稿に放送枠を補うときも休止した放送枠を除き、放送枠からルームを作るのも 9999 話まで", () => {
		const post = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_post_episode_room()"));
		expect(post.slice(0, post.indexOf("$$;"))).toContain(
			"AND NOT public.is_broadcast_room_session_cancelled(anime_id, room_date)",
		);
		const session = migration.slice(
			migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_broadcast_room_session_episode_room()"),
		);
		expect(session.slice(0, session.indexOf("$$;"))).toContain("AND NEW.episode_number <= 9999");
	});
});
