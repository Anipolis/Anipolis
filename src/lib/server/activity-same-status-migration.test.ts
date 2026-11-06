import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
	new URL("../../../supabase/migrations/190_activity_skip_same_status.sql", import.meta.url),
	"utf8",
).replace(/\s+/g, " ");

describe("同じステータスに戻しただけでは記録しない（190）", () => {
	it("直近の記録と同じステータスなら、新しい記録を作らない", () => {
		expect(sql).toContain(
			"IF (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND (latest.id IS NULL OR latest.status IS DISTINCT FROM NEW.status) THEN",
		);
	});

	it("スコアの書き換えと30分以内の付け直しは 181 のまま残す", () => {
		expect(sql).toContain("AND latest.status = NEW.status AND latest.created_at > now() - interval '24 hours'");
		expect(sql).toContain("AND latest.created_at > now() - interval '30 minutes'");
	});

	it("クライアントからは呼べない", () => {
		expect(sql).toContain(
			"REVOKE ALL ON FUNCTION public.record_mylist_activity() FROM PUBLIC, anon, authenticated;",
		);
	});
});
