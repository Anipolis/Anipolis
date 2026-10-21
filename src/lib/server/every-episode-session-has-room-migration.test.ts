import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/175_every_episode_session_has_room.sql", import.meta.url),
	"utf8",
);

describe("every episode session has room migration (175, #484)", () => {
	it("話数のある枠は今までどおり話数ルーム、話数の無い枠は放送日ごとの特番ルームにつなぐ", () => {
		expect(migration).toContain("IF NEW.episode_number BETWEEN 1 AND 9999 THEN");
		expect(migration).toContain(
			"NEW.episode_room_id := public.upsert_episode_room_for_airing(NEW.anime_id, NEW.episode_number);",
		);
		expect(migration).toMatch(
			/NEW\.episode_room_id := public\.upsert_special_room_for_airing\(\s+NEW\.anime_id,\s+NEW\.room_date,/,
		);
	});

	it("休止日の枠は特番ルームを作らない", () => {
		expect(migration).toMatch(
			/IF public\.is_broadcast_room_session_cancelled\(NEW\.anime_id, NEW\.room_date\) THEN\s+NEW\.episode_room_id := NULL;/,
		);
	});

	it("特番ルームのキーは air-YYYY-MM-DD（管理画面のキーの決まり ^[a-z0-9][a-z0-9-]{0,39}$ に合う）", () => {
		expect(migration).toContain("room_key text := 'air-' || to_char(p_room_date, 'YYYY-MM-DD');");
		expect("air-2026-08-27").toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
		// 名前が無いときは「M月D日の特番」
		expect(migration).toContain(`to_char(p_room_date, 'FMMM"月"FMDD"日"') || 'の特番'`);
	});

	it("管理者の上書きから作る枠は、1話分の話数があればその話数で作る", () => {
		expect(migration).toMatch(
			/WHEN override_row\.episode_start BETWEEN 1 AND 9999\s+AND COALESCE\(override_row\.episode_end, override_row\.episode_start\) = override_row\.episode_start\s+THEN override_row\.episode_start/,
		);
	});

	it("特番ルームを作る関数は service role だけが呼べる", () => {
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.upsert_special_room_for_airing(integer, date, text) FROM PUBLIC, anon, authenticated;",
		);
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
