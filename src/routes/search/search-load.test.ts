import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/queries", async (importOriginal) => {
	const original = await importOriginal<typeof import("$lib/server/queries")>();
	return {
		...original,
		// 件数・ミュートの付与はこのテストの対象外。取得した行をそのまま返す
		enrichPostsWithCounts: vi.fn(async (_supabase: unknown, rows: unknown[]) => rows),
		getAnimeRankingTrending: vi.fn(async () => []),
	};
});

import { load } from "./+page.server";

type Call = { table: string; method: string; args: unknown[] };

const RAYEARTH = { id: 42, title: "魔法騎士レイアース", title_en: "Magic Knight Rayearth", cover_url: null };

function fakeSupabase(animeRows: Record<string, unknown>[], prefixRows: Record<string, unknown>[] = []) {
	const calls: Call[] = [];
	// anime は 1 回目が部分一致、2 回目（一致が多すぎたときだけ）が前方一致の取得
	const animeResults = [
		{ data: animeRows, error: null },
		{ data: prefixRows, error: null },
	];
	const results: Record<string, { data: unknown; error: null }> = {
		posts: { data: [{ id: "p1", content: "最終話よかった", anime_id: 42 }], error: null },
		profiles: { data: [], error: null },
	};
	const from = vi.fn((table: string) => {
		const result = table === "anime" ? animeResults.shift() : results[table];
		if (!result) throw new Error(`unexpected table: ${table}`);
		const chain = Object.assign(Promise.resolve(result), {}) as Promise<unknown> & Record<string, unknown>;
		for (const method of ["select", "or", "ilike", "eq", "order", "limit"]) {
			chain[method] = (...args: unknown[]) => {
				calls.push({ table, method, args });
				return chain;
			};
		}
		return chain;
	});
	const rpc = vi.fn(async () => ({ data: [], error: null }));
	return { client: { from, rpc }, calls };
}

async function runLoad(q: string, animeRows: Record<string, unknown>[], prefixRows: Record<string, unknown>[] = []) {
	const { client, calls } = fakeSupabase(animeRows, prefixRows);
	const url = new URL(`http://localhost/search?q=${encodeURIComponent(q)}`);
	const event = {
		url,
		locals: { supabase: client, safeGetSession: async () => ({ user: null, session: null }) },
	} as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as {
		posts: unknown[];
		animeMatches: { items: { id: number }[]; total: number; tooMany: boolean };
	};
	const postsFilter = calls.find((c) => c.table === "posts" && c.method === "or")?.args[0] as string | undefined;
	const animeQueried = calls.some((c) => c.table === "anime");
	return { data, postsFilter, animeQueried };
}

describe("search page load: posts quoting the matched anime", () => {
	it("finds quoted posts of 魔法騎士レイアース when searching レイアース", async () => {
		const { data, postsFilter } = await runLoad("レイアース", [
			{ ...RAYEARTH, metadata_ready: true, hidden_by_admin: false },
		]);

		expect(postsFilter).toBe(
			'content.ilike."%レイアース%",and(anime_id.in.(42),broadcast_room_session_id.is.null,event_id.is.null,cw_anime_id.is.null)',
		);
		expect(data.posts).toHaveLength(1);
		expect(data.animeMatches).toEqual({ items: [RAYEARTH], total: 1, tooMany: false });
	});

	it("searches body text only for one-character queries and skips the anime lookup", async () => {
		const { data, postsFilter, animeQueried } = await runLoad("の", [
			{ ...RAYEARTH, metadata_ready: true, hidden_by_admin: false },
		]);

		expect(animeQueried).toBe(false);
		expect(postsFilter).toBe('content.ilike."%の%"');
		expect(data.animeMatches.items).toEqual([]);
	});

	it("falls back to body text when too many anime match, and says so", async () => {
		const many = Array.from({ length: 51 }, (_, i) => ({
			id: i + 1,
			title: `ぼっち作品${i}`,
			title_en: null,
			cover_url: null,
			metadata_ready: true,
			hidden_by_admin: false,
		}));
		const { data, postsFilter } = await runLoad("ぼっち", many);

		expect(postsFilter).toBe('content.ilike."%ぼっち%"');
		expect(data.animeMatches.tooMany).toBe(true);
		expect(data.animeMatches.items).toHaveLength(6);
	});

	it("lists an exact match found by the prefix lookup even when it is outside the first batch", async () => {
		const many = Array.from({ length: 51 }, (_, i) => ({
			id: i + 1,
			title: `あ作品ガンダム${i}`,
			title_en: null,
			title_yomi: null,
			cover_url: null,
			metadata_ready: true,
			hidden_by_admin: false,
		}));
		const exact = {
			id: 500,
			title: "ガンダム",
			title_en: null,
			title_yomi: null,
			cover_url: null,
			metadata_ready: true,
			hidden_by_admin: false,
		};
		const { data, postsFilter } = await runLoad("ガンダム", many, [exact]);

		expect(postsFilter).toBe('content.ilike."%ガンダム%"');
		expect(data.animeMatches.tooMany).toBe(true);
		expect(data.animeMatches.items[0]?.id).toBe(500);
	});

	it("keeps the too-many flag even when none of the matches can be listed", async () => {
		const hidden = Array.from({ length: 51 }, (_, i) => ({
			id: i + 1,
			title: `非公開${i}`,
			title_en: null,
			title_yomi: null,
			cover_url: null,
			metadata_ready: false,
			hidden_by_admin: false,
		}));
		const { data } = await runLoad("非公開", hidden, []);

		expect(data.animeMatches.items).toEqual([]);
		expect(data.animeMatches.tooMany).toBe(true);
	});

	it("still matches quotes of hidden anime but does not list them", async () => {
		const { data, postsFilter } = await runLoad("レイアース", [
			{ ...RAYEARTH, metadata_ready: false, hidden_by_admin: false },
		]);

		expect(postsFilter).toContain("anime_id.in.(42)");
		expect(data.animeMatches.items).toEqual([]);
		expect(data.animeMatches.total).toBe(0);
	});
});
