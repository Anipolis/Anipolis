import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/196_anime_recommendation_validation_invoker.sql", import.meta.url),
	"utf8",
);
const sql = migration.replace(/^--.*$/gm, "");

describe("anime recommendation validation migration", () => {
	it("送る人の権限で相手のマイリストを読む（読めないリストの中身を確かめられない）", () => {
		expect(sql).toMatch(
			/CREATE OR REPLACE FUNCTION public\.validate_anime_recommendation\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY INVOKER\s+SET search_path = public/,
		);
		expect(sql).not.toContain("SECURITY DEFINER");
	});

	it("ログインしていない呼び出しを、マイリストを読む前に止める", () => {
		expect(sql).toMatch(/auth\.uid\(\) IS NULL OR NEW\.recommender_id IS DISTINCT FROM auth\.uid\(\)/);
		// NULL との <> は NULL になり、検査を素通りする
		expect(sql).not.toMatch(/NEW\.recommender_id <> auth\.uid\(\)/);
		expect(sql.indexOf("IS DISTINCT FROM auth.uid()")).toBeLessThan(sql.indexOf("FROM public.user_anime_list"));
	});

	it("service role からの INSERT では本人確認をしない", () => {
		expect(sql).toMatch(
			/IF COALESCE\(auth\.role\(\), ''\) IN \('anon', 'authenticated'\)\s+AND \(auth\.uid\(\) IS NULL/,
		);
	});

	it("031 の検査（視聴済み・1日3件）を落とさない", () => {
		expect(sql).toContain("IF recipient_status IN ('watching', 'completed') THEN");
		expect(sql).toContain("IF todays_count >= 3 THEN");
		expect(sql).toMatch(
			/\(created_at AT TIME ZONE 'Asia\/Tokyo'\)::date = \(now\(\) AT TIME ZONE 'Asia\/Tokyo'\)::date/,
		);
	});

	it("anon に書き込みの権限を持たせない", () => {
		expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.anime_recommendations FROM anon;");
	});
});
