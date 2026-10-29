import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import type { Anime } from "$lib/types";
import { attachAnimeAverageScores } from "./queries";

type Result = { data: unknown[] | null; error: { message: string } | null };

function stubSupabase(result: Result) {
	const query = { select: () => query, in: vi.fn(async () => result) };
	const from = vi.fn(() => query);
	return { client: { from } as unknown as SupabaseClient<Database>, from, query };
}

const anime = (id: string, extra: Partial<Anime> = {}) => ({ id, title: `作品${id}`, ...extra }) as Anime;

afterEach(() => {
	vi.restoreAllMocks();
});

describe("attachAnimeAverageScores", () => {
	it("評価のある作品は平均と件数、ない作品は件数0・平均なしにする", async () => {
		const { client } = stubSupabase({
			data: [
				{ anime_id: 1, avg_score: 8.5, score_count: 2 },
				{ anime_id: 2, avg_score: 0, score_count: 0 },
			],
			error: null,
		});
		const animes = [anime("1"), anime("2"), anime("3")];
		await attachAnimeAverageScores(client, animes);
		expect(animes.map((a) => [a.avg_score, a.score_count])).toEqual([
			[8.5, 2],
			[null, 0],
			[null, 0],
		]);
	});

	it("取得に失敗したら件数を入れない（評価なしと区別する）", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { client } = stubSupabase({ data: null, error: { message: "timeout" } });
		const animes = [anime("1"), anime("2")];
		await attachAnimeAverageScores(client, animes);
		expect(animes.every((a) => a.score_count === undefined && a.avg_score === undefined)).toBe(true);
	});

	it("高評価タブのように取得済みの作品は問い合わせない", async () => {
		const { client, from } = stubSupabase({ data: [], error: null });
		const animes = [anime("1", { avg_score: 9, score_count: 4 })];
		await attachAnimeAverageScores(client, animes);
		expect(from).not.toHaveBeenCalled();
		expect(animes[0]?.avg_score).toBe(9);
	});
});
