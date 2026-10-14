import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/153_episode_rooms.sql", import.meta.url), "utf8");

describe("episode rooms migration (153)", () => {
	it("作品×話数と作品×特番キーで一意な話数ルームを作る", () => {
		expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.episode_rooms");
		expect(migration).toMatch(
			/episode_rooms_episode_unique\s+ON public\.episode_rooms \(anime_id, episode_number\)\s+WHERE kind = 'episode'/,
		);
		expect(migration).toMatch(
			/episode_rooms_special_unique\s+ON public\.episode_rooms \(anime_id, special_key\)\s+WHERE kind = 'special'/,
		);
		expect(migration).toContain("ALTER TABLE public.episode_rooms ENABLE ROW LEVEL SECURITY;");
		// 管理者が非表示にした作品のルームは管理者だけが読める
		expect(migration).toContain("AND (NOT a.hidden_by_admin OR public.is_current_user_admin())");
		expect(migration).not.toMatch(/CREATE POLICY[^;]*episode_rooms[^;]*FOR (INSERT|UPDATE|DELETE)/);
	});

	it("放送枠と投稿に話数ルームを紐づける列を足すだけで、既存の列は変えない", () => {
		expect(migration).toContain(
			"ADD COLUMN IF NOT EXISTS episode_room_id uuid REFERENCES public.episode_rooms(id) ON DELETE SET NULL",
		);
		expect(migration).toContain("CHECK (airing_kind IN ('first', 'rerun', 'event'))");
		expect(migration).not.toMatch(
			/ALTER COLUMN|DROP COLUMN|DROP TRIGGER IF EXISTS posts_enforce_broadcast_room_window/,
		);
	});

	it("ルームの開く時刻は放送枠の変更のたびに計算し直し、延期なら後ろへ動かす（開いたルームは閉じない）", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.refresh_episode_room_opens_at(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("WHEN opens_at IS NULL OR opens_at > now() THEN earliest");
		expect(body).toContain("ELSE LEAST(opens_at, earliest)");
		expect(body).toContain("AND NOT opens_at_locked");
		expect(migration).toMatch(
			/CREATE TRIGGER broadcast_room_sessions_refresh_room_opens\s+AFTER INSERT OR UPDATE OF episode_room_id, posting_opens_at, episode_number, room_kind, anime_id OR DELETE/,
		);
	});

	it("話数の放送枠でなくなった放送枠（ロビーへの変更など）はルームから外す", () => {
		const start = migration.indexOf(
			"CREATE OR REPLACE FUNCTION public.assign_broadcast_room_session_episode_room()",
		);
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("NEW.episode_room_id := NULL;");
		expect(body).not.toContain("ELSIF TG_OP = 'INSERT' OR NEW.episode_number IS DISTINCT FROM OLD.episode_number");
	});

	it("話数の訂正で放送枠が別の話数ルームへ移ったら、その時間内の投稿も移す", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER broadcast_room_sessions_assign_episode_room\s+BEFORE INSERT OR UPDATE OF episode_number, room_kind, anime_id, posting_opens_at/,
		);
		// UPDATE OF episode_room_id だと BEFORE トリガーでの変更を拾えない
		expect(migration).toMatch(
			/CREATE TRIGGER broadcast_room_sessions_move_posts\s+AFTER UPDATE ON public\.broadcast_room_sessions\s+FOR EACH ROW\s+WHEN \(OLD\.episode_room_id IS DISTINCT FROM NEW\.episode_room_id\)/,
		);
	});

	it("話数ルームへの直接の投稿は、開いているルームだけ受け付け、放送枠の時間内なら放送枠も補う", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_post_episode_room()");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("target_room.opens_at > clock_timestamp()");
		expect(body).toContain("target_room.merged_into IS NOT NULL");
		expect(body).toContain("NEW.broadcast_room_session_id := live_session_id;");
		// 話数ルームの無い放送枠（総合ロビーなど）に話数ルームを併記した投稿も拒否する
		expect(body).toContain("ELSIF NEW.episode_room_id IS DISTINCT FROM session_room_id THEN");
		// 061 の時間の検査より先に動く名前にする
		expect("posts_assign_episode_room" < "posts_enforce_broadcast_room_window").toBe(true);
	});

	it("放送枠のない話数ルームは、話数のある作品の放送済みの話だけ開く", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.ensure_episode_room(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("target_anime.type = 'TV'");
		expect(body).toContain("(target_anime.hidden_by_admin AND NOT public.is_current_user_admin())");
		expect(body).toContain("target_anime.type IN ('ONA', 'OVA') AND COALESCE(target_anime.episode_total, 0) >= 2");
		expect(body).toContain("p_episode_number > target_anime.episode_total");
		expect(body).toContain("p_episode_number > max_aired_episode");
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.ensure_episode_room(integer, integer) TO authenticated, service_role;",
		);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
