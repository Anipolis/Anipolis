import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/171_event_room_post_guard.sql", import.meta.url),
	"utf8",
);
const eventPage = readFileSync(new URL("../../routes/events/[id]/+page.server.ts", import.meta.url), "utf8");

describe("event room post guard migration (171, #238)", () => {
	it("イベントの投稿で、利用者からの書き込みだけを検査する", () => {
		expect(migration).toContain(
			"IF NEW.event_id IS NULL OR COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN",
		);
		expect(migration).toMatch(
			/BEFORE INSERT OR UPDATE OF event_id, anime_id, broadcast_room_session_id, episode_room_id ON public\.posts/,
		);
	});

	it("放送回ルーム・話数ルームとの同時指定、中止・存在しないイベント、作品の不一致を拒否する", () => {
		expect(migration).toContain(
			"IF NEW.broadcast_room_session_id IS NOT NULL OR NEW.episode_room_id IS NOT NULL THEN",
		);
		expect(migration).toContain("IF NOT FOUND OR target_event.is_cancelled THEN");
		expect(migration).toContain("IF NEW.anime_id IS DISTINCT FROM target_event.anime_id THEN");
	});

	it("受付時間は scheduled_at から duration_minutes（既定は画面と同じ 360 分）まで", () => {
		expect(migration).toContain("IF now() < target_event.scheduled_at THEN");
		expect(migration).toContain("make_interval(mins => COALESCE(target_event.duration_minutes, 360))");
		// 画面側の既定値と一致していること
		expect(eventPage).toContain("const DEFAULT_EVENT_DURATION_MINUTES = 6 * 60;");
	});

	it("拒否は 22023 で、HINT に画面に出す文言を入れる", () => {
		const raises = [
			...migration.matchAll(/RAISE EXCEPTION '([a-z_]+)'\s+USING ERRCODE = '22023',\s+HINT = '([^']+)'/g),
		];
		expect(raises.map((match) => match[1])).toEqual([
			"event_post_room_conflict",
			"event_not_open",
			"event_post_anime_mismatch",
			"event_post_not_started",
			"event_post_closed",
		]);
	});

	it("CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
