import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bounds = readFileSync(
	new URL("../../../supabase/migrations/186_episode_room_bounds.sql", import.meta.url),
	"utf8",
);
const onaOva = readFileSync(
	new URL("../../../supabase/migrations/187_ona_ova_episode_rooms.sql", import.meta.url),
	"utf8",
);

describe("話数ルームの範囲の計算（186）", () => {
	it("放送枠のある最も早いルーム（休止を除く）を初回の手がかりにする", () => {
		expect(bounds).toContain("first_airing_date - target_anime.aired_from BETWEEN -1 AND 6");
		expect(bounds).toMatch(
			/AND s\.airing_kind = 'first'\s+AND NOT public\.is_broadcast_room_session_cancelled\(s\.anime_id, s\.room_date\)\s+ORDER BY s\.room_date/,
		);
	});

	it("放送開始の週の話数が 2 以上なら、総話数を超える前でも通算と判定する", () => {
		expect(bounds).toContain(
			"max_room_number > target_anime.episode_total OR (anchored AND first_airing_number > 1)",
		);
	});

	it("読み取りの関数は未ログインでも呼べ、ルームを作る関数は呼べない", () => {
		expect(bounds).toContain("STABLE");
		expect(bounds).toContain(
			"GRANT EXECUTE ON FUNCTION public.episode_room_bounds(integer) TO anon, authenticated, service_role;",
		);
		expect(bounds).toContain(
			"REVOKE ALL ON FUNCTION public.ensure_episode_room(integer, integer) FROM PUBLIC, anon;",
		);
	});

	it("ルームを作る関数も同じ計算を使う", () => {
		expect(bounds).toContain("SELECT * INTO bounds FROM public.episode_room_bounds(p_anime_id);");
		expect(bounds).toContain("p_episode_number < bounds.season_first OR p_episode_number > bounds.season_last");
	});
});

describe("ONA / OVA の話数ルーム（187）", () => {
	it("2話以上で、手で決めた作品と15分以下の短編は変えない", () => {
		expect(onaOva).toContain("AND a.episode_total >= 2");
		expect(onaOva).toContain("AND a.room_type_source IS DISTINCT FROM 'manual'");
		expect(onaOva).toContain("<= 15");
	});
});
