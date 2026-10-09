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
type TableResult = { data: unknown; error: { message: string } | null };

function fakeSupabase(anime: TableResult) {
	const calls: Call[] = [];
	const results: Record<string, TableResult> = {
		anime,
		posts: { data: [{ id: "p1", content: "", anime_id: 17644 }], error: null },
		profiles: { data: [], error: null },
	};
	const from = vi.fn((table: string) => {
		const result = results[table];
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

async function runLoad(q: string, anime: TableResult) {
	const { client, calls } = fakeSupabase(anime);
	const url = new URL(`http://localhost/search?q=${encodeURIComponent(q)}`);
	const event = {
		url,
		locals: { supabase: client, safeGetSession: async () => ({ user: null, session: null }) },
	} as unknown as Parameters<typeof load>[0];
	const data = (await load(event)) as { posts: unknown[] } & Record<string, unknown>;
	const postsFilter = calls.find((c) => c.table === "posts" && c.method === "or")?.args[0] as string | undefined;
	const animeQueried = calls.some((c) => c.table === "anime");
	return { data, postsFilter, animeQueried };
}

const ids = (...values: number[]) => ({ data: values.map((id) => ({ id })), error: null });

describe("search page load: posts quoting the matched anime", () => {
	it("finds quoted posts of 魔法騎士レイアース when searching レイアース", async () => {
		const { data, postsFilter } = await runLoad("レイアース", ids(17644));

		expect(postsFilter).toBe(
			'content.ilike."%レイアース%",and(anime_id.in.(17644),broadcast_room_session_id.is.null,event_id.is.null,cw_anime_id.is.null)',
		);
		expect(data.posts).toHaveLength(1);
		// 作品欄は出さない
		expect(data).not.toHaveProperty("animeMatches");
	});

	it("searches body text only for one-character queries and skips the anime lookup", async () => {
		const { postsFilter, animeQueried } = await runLoad("の", ids(1));

		expect(animeQueried).toBe(false);
		expect(postsFilter).toBe('content.ilike."%の%"');
	});

	it("falls back to body text when too many anime match", async () => {
		const many = ids(...Array.from({ length: 51 }, (_, i) => i + 1));
		const { postsFilter } = await runLoad("ぼっち", many);

		expect(postsFilter).toBe('content.ilike."%ぼっち%"');
	});

	it("falls back to body text when the anime lookup fails", async () => {
		const { data, postsFilter } = await runLoad("レイアース", { data: null, error: { message: "boom" } });

		expect(postsFilter).toBe('content.ilike."%レイアース%"');
		expect(data.posts).toHaveLength(1);
	});
});
