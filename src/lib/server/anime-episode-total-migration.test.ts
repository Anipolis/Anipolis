import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/152_anime_episode_total.sql", import.meta.url),
	"utf8",
);

describe("anime episode_total migration (152, #354)", () => {
	it("整数の列を足し、episode_count からトリガーで同期する", () => {
		expect(migration).toContain("ADD COLUMN IF NOT EXISTS episode_total integer");
		expect(migration).toContain("CHECK (episode_total IS NULL OR episode_total > 0)");
		expect(migration).toMatch(
			/CREATE TRIGGER sync_anime_episode_total\s+BEFORE INSERT OR UPDATE OF episode_count, episode_total ON public\.anime/,
		);
		// integer に収まる9桁までだけを変換する（桁数の制限が無い044の値で変換が失敗しないように）
		expect(migration).toContain("WHEN NEW.episode_count ~ '^[1-9][0-9]{0,8}$' THEN NEW.episode_count::integer");
		expect(migration).not.toMatch(/\[0-9\]\*\$'/);
	});

	it("今の本番アプリと互換にする（episode_count の型とビューには触れない）", () => {
		expect(migration).not.toMatch(/ALTER COLUMN episode_count/);
		expect(migration).not.toMatch(/DROP COLUMN/);
		expect(migration).not.toMatch(/CREATE (OR REPLACE )?VIEW/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
