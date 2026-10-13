import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST_RATE_LIMIT_ERROR_CODE } from "./actions";

const migration = readFileSync(
	new URL("../../../supabase/migrations/147_post_rate_limit.sql", import.meta.url),
	"utf8",
);

describe("post rate limit migration (147, #321)", () => {
	it("投稿の INSERT 直前に、同じユーザーの直近60秒の投稿数で止める", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER enforce_post_rate_limit\s+BEFORE INSERT ON public\.posts\s+FOR EACH ROW/,
		);
		expect(migration).toMatch(/p\.user_id = NEW\.user_id\s+AND p\.created_at > now\(\) - interval '60 seconds'/);
		expect(migration).toMatch(/IF recent_count >= 20 THEN/);
	});

	it("アプリが判別する SQLSTATE（PostgREST が 429 にする PT429）で止める", () => {
		expect(migration).toContain(`ERRCODE = '${POST_RATE_LIMIT_ERROR_CODE}'`);
		expect(POST_RATE_LIMIT_ERROR_CODE).toBe("PT429");
	});

	it("本人の INSERT だけを数え、非表示の自分の投稿も含めて数える", () => {
		expect(migration).toMatch(
			/IF auth\.uid\(\) IS NULL OR NEW\.user_id IS DISTINCT FROM auth\.uid\(\) THEN\s+RETURN NEW;/,
		);
		expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
