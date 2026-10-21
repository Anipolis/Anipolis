import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/158_episode_room_merge_atomic.sql", import.meta.url),
	"utf8",
);

describe("episode room merge migration (158, #395 Codex)", () => {
	it("統合は両方のルームをロックし、統合済みにしてから投稿を移す（1回のトランザクション）", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.merge_episode_rooms(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("FOR UPDATE");
		expect(body.indexOf("SET merged_into = p_target")).toBeLessThan(
			body.indexOf("UPDATE public.posts SET episode_room_id = p_target"),
		);
		expect(body).toContain("source room has airings");
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.merge_episode_rooms(uuid, uuid) TO service_role;",
		);
	});

	it("投稿のトリガーはルームの行を共有ロックして読む（統合中の投稿は待たされる）", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.assign_post_episode_room()");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("WHERE id = NEW.episode_room_id FOR SHARE;");
	});

	it("開く時刻の固定を外すことと計算し直しを1回で行う", () => {
		const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.unlock_episode_room_opens_at(");
		const body = migration.slice(start, migration.indexOf("$$;", start));
		expect(body).toContain("SET opens_at_locked = false");
		expect(body).toContain("PERFORM public.refresh_episode_room_opens_at(p_room_id);");
	});
});
