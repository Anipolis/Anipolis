import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/183_episode_room_cumulative_season.sql", import.meta.url),
	"utf8",
);

const firstAiringMigration = readFileSync(
	new URL("../../../supabase/migrations/184_episode_room_season_first_airing.sql", import.meta.url),
	"utf8",
);

describe("通算の話数の作品の範囲（184）", () => {
	it("放送枠のある最も早いルームが放送開始の週の放送なら初回とみなす", () => {
		expect(firstAiringMigration).toContain("first_airing_date - target_anime.aired_from BETWEEN -1 AND 6");
		expect(firstAiringMigration).toContain("AND s.airing_kind = 'first'");
		expect(firstAiringMigration).toContain("season_first := first_airing_number;");
	});

	it("放送が終わった通算の作品だけ、放送枠が無い話も開ける", () => {
		expect(firstAiringMigration).toContain("IF p_episode_number > max_aired_episode AND NOT season_ended THEN");
		expect(firstAiringMigration).toContain("season_ended boolean := false;");
	});

	it("権限は今のまま", () => {
		expect(firstAiringMigration).toContain(
			"REVOKE ALL ON FUNCTION public.ensure_episode_room(integer, integer) FROM PUBLIC, anon;",
		);
	});
});

describe("通算の話数の作品の話数ルーム（183）", () => {
	it("総話数で一律に断らず、シーズンの範囲で判定する", () => {
		expect(migration).not.toContain(
			"OR (target_anime.episode_total IS NOT NULL AND p_episode_number > target_anime.episode_total)",
		);
		expect(migration).toContain("season_first := GREATEST(1, max_room_number - target_anime.episode_total + 1);");
		expect(migration).toContain("IF p_episode_number < season_first OR p_episode_number > season_last THEN");
		expect(migration).toContain("ELSIF p_episode_number > target_anime.episode_total THEN");
	});

	it("統合済みのルームを数えず、権限は今のまま", () => {
		expect(migration).toContain("AND r.merged_into IS NULL");
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.ensure_episode_room(integer, integer) FROM PUBLIC, anon;",
		);
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.ensure_episode_room(integer, integer) TO authenticated, service_role;",
		);
	});
});
