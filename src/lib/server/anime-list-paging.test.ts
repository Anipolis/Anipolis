import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { animeListOrderColumns, getAnimeListPage } from "./queries";

/** 本番の PostgREST と同じく、1回の応答は最大 1000 行 */
const MAX_ROWS = 1000;

type Row = Record<string, unknown> & { id: number };

const SEASONS = ["2026-fall", "2026-summer", "2025-winter", "2024-spring", null] as const;

function seasonSortKey(season: string | null): number | null {
	const match = season?.match(/^(\d{4})-(winter|spring|summer|fall)$/);
	if (!match) return null;
	return Number(match[1]) * 4 + ["winter", "spring", "summer", "fall"].indexOf(match[2] ?? "");
}

/**
 * 一括取り込みを模したデータ: 100件ずつ同じ created_at を持つ（本番は最大98件が同時刻）。
 * id が大きいほど新しく登録された作品。
 */
function buildRows(count: number, override: (row: Row) => void = () => {}): Row[] {
	return Array.from({ length: count }, (_, index) => {
		const id = index + 1;
		const season = SEASONS[id % SEASONS.length] ?? null;
		const row: Row = {
			id,
			title: `作品${id}`,
			created_at: `2026-0${1 + Math.floor(id / 1000)}-01T00:00:${String(Math.floor((id % 1000) / 100)).padStart(2, "0")}Z`,
			season,
			season_sort_key: seasonSortKey(season),
			genre: [],
			genre_en: [],
			broadcast_day: id % 7,
			metadata_ready: true,
			computed_broadcast_status: "finished",
			list_count: 0,
			recent_count: 0,
			avg_score: 0,
			score_count: 0,
			rating_sort_score: 0,
		};
		override(row);
		return row;
	});
}

function compareDesc(a: unknown, b: unknown): number {
	// 降順・NULL は最後（nullsFirst: false）
	if (a === b) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	return (a as number | string) < (b as number | string) ? 1 : -1;
}

/** anime_list_sortable / anime_with_computed_broadcast_status への問い合わせを模す */
function fakeSupabase(rows: Row[]) {
	const calls: { table: string; orders: string[]; range: [number, number] | null; count: boolean }[] = [];

	function builder(table: string, source: Row[] = rows) {
		let filtered = [...source];
		const orders: string[] = [];
		let range: [number, number] | null = null;
		let count = false;
		let head = false;
		const run = () => {
			calls.push({ table, orders: [...orders], range, count });
			const sorted = [...filtered].sort((a, b) => {
				for (const column of orders) {
					const delta = compareDesc(a[column], b[column]);
					if (delta !== 0) return delta;
				}
				return 0;
			});
			const total = sorted.length;
			const [from, to] = range ?? [0, total - 1];
			// 本番で確認した挙動: 件数を数えるときだけ、offset が件数を超えると 416（PGRST103）。
			// 件数を数えない取得は範囲外でも空配列を返す
			if (range && count && from > total) {
				return {
					data: null,
					error: { code: "PGRST103", message: "Requested range not satisfiable" },
					count: null,
				};
			}
			const data = head ? null : sorted.slice(from, Math.min(to + 1, from + MAX_ROWS));
			return { data, error: null, count: count ? total : null };
		};
		const chain = {
			select(_columns: string, options?: { count?: string; head?: boolean }) {
				// RPC は件数の指定を rpc() 側で受け取り、select() には渡さない
				if (options) {
					count = options.count === "exact";
					head = Boolean(options.head);
				}
				return chain;
			},
			// ジャンル等の or 条件は、テストのデータがすべて満たす前提で素通しにする
			or() {
				return chain;
			},
			eq(column: string, value: unknown) {
				filtered = filtered.filter((row) => row[column] === value);
				return chain;
			},
			in(column: string, values: unknown[]) {
				const set = new Set(values);
				filtered = filtered.filter((row) => set.has(row[column]));
				return chain;
			},
			order(column: string) {
				orders.push(column);
				return chain;
			},
			range(from: number, to: number) {
				range = [from, to];
				return chain;
			},
			// biome-ignore lint/suspicious/noThenProperty: PostgREST のビルダーと同じく await できるようにする
			then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
				return Promise.resolve(run()).then(resolve, reject);
			},
		};
		return chain;
	}

	/** anime_list_with_genre_match（145）: genre と genre_en を小文字で比べ、選んだタグの一致数を足す */
	function rpc(name: string, args: { p_genres: string[] }, options?: { count?: string }) {
		const selected = args.p_genres.map((genre) => genre.toLowerCase());
		const ranked = rows.map((row) => {
			const tags = new Set(
				[...((row["genre"] as string[]) ?? []), ...((row["genre_en"] as string[]) ?? [])].map((tag) =>
					tag.toLowerCase(),
				),
			);
			return { ...row, genre_match: selected.filter((genre) => tags.has(genre)).length };
		});
		const chain = builder(name, ranked);
		return chain.select("*", options ?? {});
	}

	return {
		client: { from: (table: string) => builder(table), rpc } as unknown as SupabaseClient<Database>,
		calls,
	};
}

async function collectAllPages(supabase: SupabaseClient<Database>, options: Parameters<typeof getAnimeListPage>[1]) {
	const ids: string[] = [];
	for (let page = 1; ; page++) {
		const result = await getAnimeListPage(supabase, { ...options, page, pageSize: 50 });
		if (result.items.length === 0) return { ids, total: result.total };
		ids.push(...result.items.map((anime) => anime.id));
	}
}

describe("getAnimeListPage（#322 DB でのページ分け）", () => {
	it("1000件を超えても件数が正しく、最後のページまで重複・欠落なく辿れる", async () => {
		const rows = buildRows(2501);
		const { client } = fakeSupabase(rows);

		const { ids, total } = await collectAllPages(client, { newestSeasonFirst: true });

		expect(total).toBe(2501);
		expect(ids).toHaveLength(2501);
		expect(new Set(ids).size).toBe(2501);
	});

	it("「すべて」は新しいシーズン順、同じシーズン内は新着順、シーズン不明は最後", async () => {
		const { client } = fakeSupabase(buildRows(2501));
		const { ids } = await collectAllPages(client, { newestSeasonFirst: true });

		const byId = new Map(buildRows(2501).map((row) => [String(row.id), row]));
		const keys = ids.map((id) => byId.get(id)?.["season_sort_key"] as number | null);
		const firstNull = keys.indexOf(null);
		expect(keys.slice(0, firstNull).every((key, i, all) => i === 0 || (all[i - 1] ?? 0) >= (key ?? 0))).toBe(true);
		expect(keys.slice(firstNull).every((key) => key === null)).toBe(true);
		// 先頭は最も新しいシーズン（2026-fall）の中で最も新しく登録された作品
		expect(byId.get(ids[0] ?? "")?.["season"]).toBe("2026-fall");
	});

	it("人気順は全作品から決まる（登録が古い1001件目以降の人気作も先頭に来る）", async () => {
		const rows = buildRows(2501, (row) => {
			if (row.id === 7) row["list_count"] = 50; // 最も古い登録のひとつ
			if (row.id === 2400) row["list_count"] = 10;
		});
		const { client } = fakeSupabase(rows);

		const result = await getAnimeListPage(client, { sortBy: "popular", page: 1, pageSize: 50 });

		expect(result.total).toBe(2501);
		expect(result.items.slice(0, 2).map((anime) => anime.id)).toEqual(["7", "2400"]);
		expect(result.items[0]?.list_count).toBe(50);
	});

	it("件数を超えたページでは空を返し、件数は保つ", async () => {
		const { client } = fakeSupabase(buildRows(120));
		const result = await getAnimeListPage(client, { page: 99, pageSize: 50 });
		expect(result).toEqual({ items: [], total: 120 });
	});

	it("放送中タブ（本日放送を先頭）は候補を1000件ずつ全件取ってから並べる", async () => {
		const rows = buildRows(1500, (row) => {
			row["computed_broadcast_status"] = "airing";
		});
		const { client, calls } = fakeSupabase(rows);

		const result = await getAnimeListPage(client, {
			broadcastStatus: "airing",
			newestSeasonFirst: true,
			prioritizeBroadcastDay: 3,
			page: 1,
			pageSize: 50,
		});

		expect(result.total).toBe(1500);
		expect(result.items.every((anime) => anime.broadcast_day === 3)).toBe(true);
		const candidateCalls = calls.filter((call) => call.table === "anime_list_sortable");
		expect(candidateCalls.length).toBeGreaterThanOrEqual(2);
	});
});

describe("getAnimeListPage の複数タグ選択（同じ種類のタグは OR で絞る）", () => {
	// 同じシーズン・同じ人気。古い作品は両方のタグに、新しい作品は片方だけに当てはまる
	function genreRows() {
		return buildRows(2, (row) => {
			row["season"] = "2026-fall";
			row["season_sort_key"] = 2026 * 4 + 3;
			row["genre"] = row.id === 1 ? ["アクション", "コメディ"] : ["アクション"];
		});
	}

	it("選んだタグに多く当てはまる作品を先に並べる（人気順）", async () => {
		const { client, calls } = fakeSupabase(genreRows());
		const result = await getAnimeListPage(client, {
			sortBy: "popular",
			genres: ["アクション", "コメディ"],
			page: 1,
			pageSize: 50,
		});

		expect(result.items.map((anime) => anime.id)).toEqual(["1", "2"]);
		const rpcCall = calls.find((call) => call.table === "anime_list_with_genre_match");
		expect(rpcCall?.orders).toEqual(["list_count", "genre_match", "season_sort_key", "created_at", "id"]);
		// 件数は関数経由だと遅いので、同じ絞り込みのビューで数える
		expect(rpcCall?.count).toBe(false);
		expect(calls.some((call) => call.table === "anime_list_sortable" && call.count)).toBe(true);
		expect(result.total).toBe(2);
	});

	it("新着順でも一致数を優先する", async () => {
		const { client } = fakeSupabase(genreRows());
		const result = await getAnimeListPage(client, { genres: ["アクション", "コメディ"], page: 1, pageSize: 50 });
		expect(result.items.map((anime) => anime.id)).toEqual(["1", "2"]);
	});

	it("タグが1つなら一致数は全件同じなので、ビューから取る", async () => {
		const { client, calls } = fakeSupabase(genreRows());
		await getAnimeListPage(client, { sortBy: "popular", genres: ["アクション"], page: 1, pageSize: 50 });
		expect(calls[0]?.table).toBe("anime_list_sortable");
		expect(calls[0]?.orders).not.toContain("genre_match");
	});
});

describe("animeListOrderColumns", () => {
	it("並びの最後は必ず created_at・id（同時刻の作品の順番を一意にする）", () => {
		expect(animeListOrderColumns("created", true)).toEqual(["season_sort_key", "created_at", "id"]);
		expect(animeListOrderColumns("created", false)).toEqual(["created_at", "id"]);
	});

	it("人気・話題・評価が同点なら新しいシーズンを先にする（大半が0件で同点になるため）", () => {
		expect(animeListOrderColumns("popular", false)).toEqual(["list_count", "season_sort_key", "created_at", "id"]);
		expect(animeListOrderColumns("trending", false)).toEqual([
			"recent_count",
			"season_sort_key",
			"created_at",
			"id",
		]);
		expect(animeListOrderColumns("top_rated", false)).toEqual([
			"rating_sort_score",
			"score_count",
			"season_sort_key",
			"created_at",
			"id",
		]);
		// シーズン順が先頭にあるときは重ねない
		expect(animeListOrderColumns("popular", true)).toEqual(["season_sort_key", "list_count", "created_at", "id"]);
	});

	it("人気が同点（0件）の古い作品は、新しい作品より後ろに並ぶ", async () => {
		const rows = buildRows(300);
		const { client } = fakeSupabase(rows);
		const result = await getAnimeListPage(client, { sortBy: "popular", page: 1, pageSize: 50 });
		expect(result.items[0]?.season).toBe("2026-fall");
	});
});

describe("anime_list_sortable migration (144)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/144_anime_list_sortable_view.sql", import.meta.url),
		"utf8",
	);

	it("既存の一覧ビューの列を引き継ぎ、並べ替え用の列を足す", () => {
		expect(migration).toMatch(
			/CREATE OR REPLACE VIEW public\.anime_list_sortable\s+WITH \(security_invoker = true\)/,
		);
		expect(migration).toMatch(/v\.\*[\s\S]*FROM public\.anime_with_computed_broadcast_status v/);
		for (const column of [
			"season_sort_key",
			"list_count",
			"recent_count",
			"avg_score",
			"score_count",
			"rating_sort_score",
		]) {
			expect(migration).toContain(`AS ${column}`);
		}
		expect(migration).toMatch(/WHEN 'winter' THEN 0[\s\S]*WHEN 'spring' THEN 1[\s\S]*WHEN 'summer' THEN 2/);
	});

	it("CLI push 運用に反する CONCURRENTLY を含めない", () => {
		expect(migration).not.toMatch(/CONCURRENTLY/i);
	});
});

describe("anime_list_with_genre_match migration (145)", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/145_anime_list_genre_match.sql", import.meta.url),
		"utf8",
	);
	const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"));

	it("144 のビューに genre_match を足した行を返す", () => {
		expect(migration).toMatch(
			/CREATE OR REPLACE VIEW public\.anime_list_genre_ranked[\s\S]*?s\.\*,\s*0::integer AS genre_match/,
		);
		expect(fn).toMatch(/RETURNS SETOF public\.anime_list_genre_ranked/);
		// アプリの countGenreMatches と同じく genre と genre_en を小文字で比べる
		expect(fn).toMatch(/lower\(selected\.name\) IN/);
		expect(fn).toMatch(/COALESCE\(s\.genre, '\{\}'::text\[\]\) \|\| COALESCE\(s\.genre_en/);
		expect(fn).toContain("p_genres[1:20]");
	});

	it("PostgREST の絞り込みが中まで効くよう、展開できる形（SQL・STABLE・SET 句なし・INVOKER）にする", () => {
		const header = fn.slice(0, fn.indexOf("AS $$"));
		expect(header).toMatch(/LANGUAGE sql/);
		expect(header).toMatch(/STABLE/);
		expect(header).not.toMatch(/SECURITY DEFINER/);
		expect(header).not.toMatch(/\bSET\b/);
		expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.anime_list_with_genre_match\(text\[\]\) FROM PUBLIC/);
	});
});
