import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";
import {
	getBookmarkedPostsPage,
	getLikedPostsPage,
	getProfileImagePostsPage,
	getProfileTimelinePage,
	mergeProfileTimelineCandidates,
} from "./queries";

type TableResult = { data: unknown; error: { message: string } | null };

const CHAIN_METHODS = ["select", "is", "order", "limit", "or", "eq", "in", "not", "filter", "neq"] as const;

/** await でテーブルの結果を返すクエリビルダーの模造。呼ばれたフィルターは calls に残す */
function awaitableChain(result: TableResult, calls: string[]) {
	const chain = Promise.resolve(result) as Promise<TableResult> & Record<string, (...args: unknown[]) => unknown>;
	for (const method of CHAIN_METHODS) {
		chain[method] = (...args: unknown[]) => {
			calls.push(`${method}(${args.map((arg) => JSON.stringify(arg)).join(",")})`);
			return chain;
		};
	}
	return chain;
}

/** テーブルごとに、呼ばれた順に結果を返す（posts は「本人の投稿」→「リポスト元」の順に読まれる） */
function fakeSupabase(tables: Record<string, TableResult[]>) {
	const calls: Record<string, string[]> = {};
	const from = vi.fn((table: string) => {
		const queue = tables[table];
		const result = queue && queue.length > 1 ? queue.shift() : queue?.[0];
		if (!result) throw new Error(`unexpected table: ${table}`);
		calls[table] ??= [];
		const tableCalls: string[] = [];
		calls[table].push("--");
		const chain = awaitableChain(result, tableCalls);
		queueMicrotask(() => calls[table]?.push(...tableCalls));
		return chain;
	});
	const rpc = vi.fn(async (name: string) => {
		if (name === "get_post_counts" || name === "get_blocked_user_ids") return { data: [], error: null };
		throw new Error(`unexpected rpc: ${name}`);
	});
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls };
}

const NO_MUTES = {
	muted_words: [{ data: [], error: null }],
	anime_mutes: [{ data: [], error: null }],
	event_mutes: [{ data: [], error: null }],
};

const PROFILE = { id: "author", username: "author", display_name: null, avatar_url: null };

function post(id: string, createdAt: string, userId = "author", extra: Partial<RawPost> = {}): RawPost {
	return {
		id,
		user_id: userId,
		parent_id: null,
		quoted_post_id: null,
		content: id,
		created_at: createdAt,
		image_urls: [],
		profiles: { username: userId, display_name: null, avatar_url: null },
		post_hashtags: [],
		anime_id: null,
		anime: null,
		broadcast_room_session_id: null,
		event_id: null,
		event: null,
		...extra,
	} as RawPost;
}

/** index が大きいほど古い（1 分ずつ） */
const minute = (index: number) => `2026-10-21T10:${String(59 - index).padStart(2, "0")}:00+00:00`;

describe("mergeProfileTimelineCandidates（#250）", () => {
	it("0 件なら続きなし", () => {
		expect(mergeProfileTimelineCandidates([], [], 50)).toEqual({ page: [], nextCursor: null });
	});

	it("ちょうど limit 件なら、その最後を目印にする（次のページが空でも進める）", () => {
		const own = Array.from({ length: 50 }, (_, i) => post(`p${String(i).padStart(2, "0")}`, minute(i)));
		const result = mergeProfileTimelineCandidates(own, [], 50);
		expect(result.page).toHaveLength(50);
		expect(result.nextCursor).toEqual({ createdAt: minute(49), id: "p49" });
	});

	it("51 件以上は先頭 limit 件をこのページにし、limit 件目を目印にする", () => {
		const own = Array.from({ length: 30 }, (_, i) => post(`p${String(i).padStart(2, "0")}`, minute(i * 2)));
		const reposts = Array.from({ length: 30 }, (_, i) => ({
			post_id: `r${String(i).padStart(2, "0")}`,
			created_at: minute(i * 2 + 1),
		}));
		const result = mergeProfileTimelineCandidates(own, reposts, 50);
		expect(result.page).toHaveLength(50);
		// 投稿とリポストが時刻順に交互に並ぶ
		expect(result.page.slice(0, 4).map((item) => item.id)).toEqual(["p00", "r00", "p01", "r01"]);
		expect(result.nextCursor).toEqual({ createdAt: minute(49), id: "r24" });
	});

	it("同じ時刻は ID の降順にし、マイクロ秒の違いも DB と同じに並べる", () => {
		const own = [
			post("aaaa", "2026-10-21T10:00:00.000001+00:00"),
			post("cccc", "2026-10-21T10:00:00.000001+00:00"),
			post("zzzz", "2026-10-21T10:00:00+00:00"),
		];
		const reposts = [
			{ post_id: "bbbb", created_at: "2026-10-21T10:00:00.000001+00:00" },
			{ post_id: "yyyy", created_at: "2026-10-21T10:00:00.000002+00:00" },
		];
		const result = mergeProfileTimelineCandidates(own, reposts, 3);
		expect(result.page.map((item) => item.id)).toEqual(["yyyy", "cccc", "bbbb"]);
		expect(result.nextCursor).toEqual({ createdAt: "2026-10-21T10:00:00.000001+00:00", id: "bbbb" });
	});
});

describe("getProfileTimelinePage（#250）", () => {
	it("リポストに投稿者の情報を付け、見えない投稿と自分の投稿のリポストは出さない。目印は除く前の並びで作る", async () => {
		const { client } = fakeSupabase({
			posts: [
				{ data: [post("own-1", minute(0)), post("own-2", minute(3))], error: null },
				// リポスト元: other-1 は見える、own-2 は自分の投稿、hidden は RLS で返ってこない
				{ data: [post("other-1", minute(9), "someone"), post("own-2", minute(3))], error: null },
			],
			reposts: [
				{
					data: [
						{ post_id: "other-1", created_at: minute(1) },
						{ post_id: "own-2", created_at: minute(2) },
						{ post_id: "hidden", created_at: minute(4) },
					],
					error: null,
				},
			],
			...NO_MUTES,
		});

		const result = await getProfileTimelinePage(client, PROFILE, null, { limit: 5 });

		expect(result.error).toBeNull();
		expect(result.posts.map((p) => [p.id, p.repost_context?.username ?? null])).toEqual([
			["own-1", null],
			["other-1", "author"],
			["own-2", null],
		]);
		expect(result.posts[1]?.repost_context?.created_at).toBe(minute(1));
		// 5 件目（hidden のリポスト）が目印。表示から外れても読み飛ばさない
		expect(result.nextCursor).toEqual({ createdAt: minute(4), id: "hidden" });
	});

	it("続きのページは、両方の流れを同じ目印より前から取る", async () => {
		const { client, calls } = fakeSupabase({
			posts: [{ data: [], error: null }],
			reposts: [{ data: [], error: null }],
			...NO_MUTES,
		});
		const cursor = { createdAt: minute(4), id: "0f8fad5b-d9cb-469f-a165-70867728950e" };
		const result = await getProfileTimelinePage(client, PROFILE, null, { cursor });
		await Promise.resolve();
		expect(result).toEqual({ posts: [], error: null, nextCursor: null });
		expect(calls["posts"]?.join(" ")).toContain(
			`or("created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})")`,
		);
		expect(calls["reposts"]?.join(" ")).toContain(
			`or("created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},post_id.lt.${cursor.id})")`,
		);
	});

	it("問い合わせの失敗は空の一覧にせず、失敗として返す", async () => {
		const { client } = fakeSupabase({
			posts: [{ data: null, error: { message: "boom" } }],
			reposts: [{ data: [], error: null }],
		});
		const result = await getProfileTimelinePage(client, PROFILE, null);
		expect(result.error).toEqual({ message: "boom" });
		expect(result.nextCursor).toBeNull();
	});
});

describe("getProfileImagePostsPage（#250）", () => {
	it("画像の有無は DB の条件で絞る（取得した投稿を画面で絞り込まない）", async () => {
		const { client, calls } = fakeSupabase({
			posts: [{ data: [post("img-1", minute(0))], error: null }],
			...NO_MUTES,
		});
		const result = await getProfileImagePostsPage(client, "author", null, { limit: 1 });
		await Promise.resolve();
		expect(result.posts.map((p) => p.id)).toEqual(["img-1"]);
		expect(result.nextCursor).toEqual({ createdAt: minute(0), id: "img-1" });
		expect(calls["posts"]?.join(" ")).toContain('filter("image_urls","neq","{}")');
		expect(calls["posts"]?.join(" ")).toContain('not("image_urls","is",null)');
	});
});

describe("getBookmarkedPostsPage / getLikedPostsPage（#243）", () => {
	it("0 件なら空で続きなし", async () => {
		const { client } = fakeSupabase({ bookmarks: [{ data: [], error: null }], ...NO_MUTES });
		expect(await getBookmarkedPostsPage(client, "viewer")).toEqual({ posts: [], error: null, nextCursor: null });
	});

	it("投稿の作成日時ではなく、いいねした順に並べる", async () => {
		const { client } = fakeSupabase({
			// 最近いいねした古い投稿（old）が先頭
			likes: [
				{
					data: [
						{ post_id: "old", created_at: minute(0) },
						{ post_id: "new", created_at: minute(1) },
					],
					error: null,
				},
			],
			posts: [{ data: [post("new", minute(2)), post("old", minute(30))], error: null }],
			...NO_MUTES,
		});
		const result = await getLikedPostsPage(client, "viewer", "viewer");
		expect(result.posts.map((p) => p.id)).toEqual(["old", "new"]);
		expect(result.nextCursor).toBeNull();
	});

	it("51 件以上あれば、50 件目のブックマークの日時と post_id を目印にする。見えなくなった投稿は抜く", async () => {
		const rows = Array.from({ length: 50 }, (_, i) => ({
			post_id: `b${String(i).padStart(2, "0")}`,
			created_at: minute(i),
		}));
		// b03 は削除・非表示で posts から返ってこない
		const visible = rows.filter((row) => row.post_id !== "b03").map((row) => post(row.post_id, minute(59)));
		const { client } = fakeSupabase({
			bookmarks: [{ data: rows, error: null }],
			posts: [{ data: visible, error: null }],
			...NO_MUTES,
		});
		const result = await getBookmarkedPostsPage(client, "viewer");
		expect(result.posts).toHaveLength(49);
		expect(result.posts.map((p) => p.id)).not.toContain("b03");
		expect(result.nextCursor).toEqual({ createdAt: minute(49), id: "b49" });
	});
});
