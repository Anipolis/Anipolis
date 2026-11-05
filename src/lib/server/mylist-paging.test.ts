import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { getOwnAnimeList, getUserAnimeList } from "./queries";

/** range ごとに行を返す偽の Supabase。読んだ範囲と並び順を記録する */
function fakeSupabase(total: number) {
	const ranges: [number, number][] = [];
	const orders: string[] = [];
	const row = {
		status: "watching",
		score: null,
		progress: 0,
		updated_at: "2026-01-01",
		created_at: "2026-01-01",
		anime: null,
	};
	const builder = {
		select: () => builder,
		eq: () => builder,
		order: (column: string) => {
			orders.push(column);
			return builder;
		},
		range: (from: number, to: number) => {
			ranges.push([from, to]);
			const count = Math.max(0, Math.min(to, total - 1) - from + 1);
			return Promise.resolve({ data: Array.from({ length: count }, () => row), error: null });
		},
	};
	const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
	return { supabase, ranges, orders };
}

describe("マイリストの全件取得", () => {
	it("1000件を超えても最後のページまで読む（並び替えの対象から漏らさない）", async () => {
		const own = fakeSupabase(2500);
		await getOwnAnimeList(own.supabase, "me");
		expect(own.ranges).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
		]);

		const user = fakeSupabase(1000);
		await getUserAnimeList(user.supabase, "me");
		expect(user.ranges).toEqual([
			[0, 999],
			[1000, 1999],
		]);
	});

	it("同じ更新日時でも行がずれないよう、順序を一意にする", async () => {
		const own = fakeSupabase(1);
		await getOwnAnimeList(own.supabase, "me");
		expect(own.orders).toEqual(["updated_at", "anime_id"]);
	});

	it("範囲を指定したときは、その範囲だけ読む", async () => {
		const user = fakeSupabase(2500);
		await getUserAnimeList(user.supabase, "me", undefined, { limit: 50, offset: 100 });
		expect(user.ranges).toEqual([[100, 149]]);
	});
});
