import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/209_episode_bounds_without_total.sql", import.meta.url),
	"utf8",
);
const original = readFileSync(
	new URL("../../../supabase/migrations/186_episode_room_bounds.sql", import.meta.url),
	"utf8",
);

describe("話数が空の作品のシーズンの範囲（209、#597）", () => {
	it("ルームと放送開始の週の手がかりは、話数の有無にかかわらず先に読む", () => {
		const anchoredAt = migration.indexOf("anchored := first_airing_date IS NOT NULL");
		const totalBranchAt = migration.indexOf("IF COALESCE(target_anime.episode_total, 0) >= 1 THEN");
		expect(anchoredAt).toBeGreaterThan(-1);
		expect(anchoredAt).toBeLessThan(totalBranchAt);
	});

	it("話数が空なら、放送開始の週の話数が 2 以上のときだけ、その話数から始める", () => {
		expect(migration).toMatch(
			/ELSIF anchored AND first_airing_number > 1 THEN[\s\S]*?season_first := first_airing_number;/,
		);
	});

	it("終わりは、ルームと放送枠（予定を含む・休止を除く）の最大の話数まで（新しい話のルームを作れるように）", () => {
		expect(migration).toMatch(
			/SELECT max\(s\.episode_number\) INTO max_session_episode[\s\S]*?AND NOT public\.is_broadcast_room_session_cancelled\(s\.anime_id, s\.room_date\);/,
		);
		expect(migration).toContain(
			"season_last := GREATEST(first_airing_number, COALESCE(max_room_number, 0), COALESCE(max_session_episode, 0));",
		);
	});

	it("話数が入っている作品の計算と、権限は 186 のまま", () => {
		for (const line of [
			"max_room_number > target_anime.episode_total OR (anchored AND first_airing_number > 1)",
			"season_last := GREATEST(max_room_number, first_airing_number + target_anime.episode_total - 1);",
			"season_first := GREATEST(1, max_room_number - target_anime.episode_total + 1);",
			"season_last := GREATEST(max_room_number, min_room_number + target_anime.episode_total - 1);",
			"REVOKE ALL ON FUNCTION public.episode_room_bounds(integer) FROM PUBLIC;",
			"GRANT EXECUTE ON FUNCTION public.episode_room_bounds(integer) TO anon, authenticated, service_role;",
			"SECURITY DEFINER",
		]) {
			expect(original).toContain(line);
			expect(migration).toContain(line);
		}
	});
});
