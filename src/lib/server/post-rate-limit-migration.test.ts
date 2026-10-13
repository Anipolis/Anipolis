import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST_RATE_LIMIT_ERROR_CODE } from "./actions";

const migration = readFileSync(
	new URL("../../../supabase/migrations/147_post_rate_limit.sql", import.meta.url),
	"utf8",
);
const fn = migration.slice(
	migration.indexOf("CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()"),
	migration.indexOf("$$;", migration.indexOf("CREATE OR REPLACE FUNCTION public.enforce_post_rate_limit()")),
);

describe("post rate limit migration (147, #321)", () => {
	it("投稿の INSERT 直前に、利用者ごとのカウンターで作成回数を数えて止める", () => {
		expect(migration).toMatch(
			/CREATE TRIGGER enforce_post_rate_limit\s+BEFORE INSERT ON public\.posts\s+FOR EACH ROW/,
		);
		expect(fn).toMatch(/IF current_count > 20 THEN/);
		expect(fn).toContain(`ERRCODE = '${POST_RATE_LIMIT_ERROR_CODE}'`);
		expect(POST_RATE_LIMIT_ERROR_CODE).toBe("PT429");
	});

	it("利用者が操作できる投稿の行（created_at の指定・削除）を数の根拠にしない", () => {
		expect(fn).not.toMatch(/FROM public\.posts/);
		expect(fn).not.toMatch(/NEW\.created_at/);
		// 区切りは DB の時刻で決める
		expect(fn).toMatch(/VALUES \(NEW\.user_id, now\(\), 1\)/);
		expect(fn).toMatch(/r\.window_started_at <= now\(\) - interval '60 seconds'/);
	});

	it("同時の投稿で上限を越えないよう、1文の INSERT ... ON CONFLICT DO UPDATE で原子的に増やす", () => {
		expect(fn).toMatch(
			/INSERT INTO public\.post_rate_limits AS r[\s\S]*?ON CONFLICT \(user_id\) DO UPDATE[\s\S]*?RETURNING r\.post_count INTO current_count/,
		);
		expect(migration).toMatch(/user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
	});

	it("カウンター表は利用者から読めず変更もできない（トリガーだけが書く）", () => {
		expect(migration).toContain("ALTER TABLE public.post_rate_limits ENABLE ROW LEVEL SECURITY");
		expect(migration).toContain("REVOKE ALL ON public.post_rate_limits FROM anon, authenticated");
		expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?post_rate_limits/);
		expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
	});

	it("本人の INSERT だけを数える（service role の取り込み等は対象外）", () => {
		expect(fn).toMatch(
			/IF auth\.uid\(\) IS NULL OR NEW\.user_id IS DISTINCT FROM auth\.uid\(\) THEN\s+RETURN NEW;/,
		);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});
