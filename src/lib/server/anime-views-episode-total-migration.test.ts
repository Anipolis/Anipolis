import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
	new URL("../../../supabase/migrations/160_anime_views_episode_total.sql", import.meta.url),
	"utf8",
);

describe("anime views episode_total migration (160, #354)", () => {
	it("依存する順に CASCADE なしで消し、3つのビューと関数を作り直す", () => {
		const statements = migration
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("--"))
			.join("\n");
		expect(statements).not.toMatch(/CASCADE/i);
		const order = [
			"DROP FUNCTION public.anime_list_with_genre_match(text[]);",
			"DROP VIEW public.anime_list_genre_ranked;",
			"DROP VIEW public.anime_list_sortable;",
			"DROP VIEW public.anime_with_computed_broadcast_status;",
			"CREATE VIEW public.anime_with_computed_broadcast_status",
			"CREATE VIEW public.anime_list_sortable",
			"CREATE VIEW public.anime_list_genre_ranked",
			"CREATE OR REPLACE FUNCTION public.anime_list_with_genre_match(p_genres text[])",
		].map((statement) => migration.indexOf(statement));
		expect(order.every((index) => index >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it("権限を付け直す", () => {
		expect(migration).toContain(
			"GRANT SELECT ON public.anime_with_computed_broadcast_status TO anon, authenticated;",
		);
		expect(migration).toContain("GRANT SELECT ON public.anime_list_sortable TO anon, authenticated;");
		expect(migration).toContain(
			"GRANT EXECUTE ON FUNCTION public.anime_list_with_genre_match(text[]) TO anon, authenticated, service_role;",
		);
	});
});
