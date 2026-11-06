import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../supabase/migrations/189_mylist_updated_at.sql", import.meta.url), "utf8");

describe("マイリストを変えた日時（189）", () => {
	it("内容が変わったときだけ今の時刻にし、それ以外は前の値を保つ", () => {
		expect(sql).toMatch(
			/\(NEW\.status, NEW\.score, NEW\.progress, NEW\.started_on, NEW\.finished_on\)\s+IS DISTINCT FROM \(OLD\.status, OLD\.score, OLD\.progress, OLD\.started_on, OLD\.finished_on\)/,
		);
		expect(sql).toContain("NEW.updated_at := now();");
		expect(sql).toContain("NEW.updated_at := OLD.updated_at;");
		expect(sql).toContain("BEFORE UPDATE ON public.user_anime_list");
	});

	it("トレンドは登録日時で数える", () => {
		expect(sql).toContain("AND ual.created_at >= now() - interval '7 days'");
		expect(sql).not.toContain("ual.updated_at");
	});
});
