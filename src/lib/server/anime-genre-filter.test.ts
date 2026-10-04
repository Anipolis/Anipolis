import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { parseAnimeListFilters } from "./anime-list-filters";
import { getAnimeCount } from "./queries";

// PostgREST のクエリビルダーを真似て、or フィルターの呼び出しだけ記録する
function fakeSupabase() {
	const orFilters: string[] = [];
	const builder = {
		select: () => builder,
		eq: () => builder,
		or: (filter: string) => {
			orFilters.push(filter);
			return builder;
		},
		contains: () => builder,
		// biome-ignore lint/suspicious/noThenProperty: await できるクエリビルダーを模している
		then: (resolve: (value: { count: number; error: null }) => unknown) => resolve({ count: 1, error: null }),
	};
	const supabase = { from: () => builder } as unknown as SupabaseClient<Database>;
	return { supabase, orFilters };
}

describe("アニメ一覧のタグ絞り込み", () => {
	it("同じ種類の中は OR、種類をまたぐと AND(種類ごとに別の or 条件)になる", async () => {
		const { supabase, orFilters } = fakeSupabase();

		await getAnimeCount(supabase, { genres: ["アクション", "コメディ", "異世界"] });

		expect(orFilters).toEqual([
			'genre.cs.{"アクション"},genre_en.cs.{"アクション"},genre.cs.{"コメディ"},genre_en.cs.{"コメディ"}',
			'genre.cs.{"異世界"},genre_en.cs.{"異世界"}',
		]);
	});

	it("タグを選ばなければ or 条件を足さない", async () => {
		const { supabase, orFilters } = fakeSupabase();

		await getAnimeCount(supabase, { genres: [] });

		expect(orFilters).toEqual([]);
	});

	it("旧表記のタグで来ても現在の表記で絞り込む", async () => {
		const { supabase, orFilters } = fakeSupabase();

		await getAnimeCount(supabase, { genres: ["オカルト"] });

		expect(orFilters).toEqual(['genre.cs.{"超常現象"},genre_en.cs.{"超常現象"}']);
	});

	it("旧表記の URL は現在の表記に直して選択状態に使う", () => {
		const filters = parseAnimeListFilters(new URLSearchParams({ genres: "オカルト,アクション,超常現象" }));

		expect(filters.genres).toEqual(["超常現象", "アクション"]);
	});
});
