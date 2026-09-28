import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { buildTimelineNextCursor, getFollowingTimelinePosts, getHomeTimelinePosts } from "./queries";

type TableResult = { data: unknown; error: { message: string } | null };

const CHAIN_METHODS = ["select", "is", "order", "limit", "or", "eq", "in", "not", "maybeSingle", "single"] as const;

/**
 * Supabase のクエリビルダーを模す: どのフィルターを挟んでも await でテーブルごとの結果を返す。
 * Promise インスタンスにメソッドを生やすので、`then` を持つオブジェクトリテラルは作らない。
 */
function awaitableChain(result: TableResult) {
	const chain = Promise.resolve(result) as Promise<TableResult> & Record<string, () => unknown>;
	for (const method of CHAIN_METHODS) chain[method] = () => chain;
	return chain;
}

function fakeSupabase(tables: Record<string, TableResult>, rpc: Record<string, TableResult>) {
	const from = vi.fn((table: string) => {
		const result = tables[table];
		if (!result) throw new Error(`unexpected table: ${table}`);
		return awaitableChain(result);
	});
	const rpcFn = vi.fn((name: string) => {
		const result = rpc[name];
		if (!result) throw new Error(`unexpected rpc: ${name}`);
		return Promise.resolve(result);
	});
	return { from, rpc: rpcFn } as unknown as SupabaseClient<Database>;
}

function rawPost(index: number, content = `post ${index}`) {
	// index が大きいほど古い投稿（作成日時は降順で並ぶ）
	const minute = String(index).padStart(2, "0");
	return {
		id: `post-${minute}`,
		user_id: "author",
		parent_id: null,
		quoted_post_id: null,
		content,
		created_at: `2026-09-28T10:${minute}:00.000Z`,
		image_urls: [],
		profiles: { username: "author", display_name: null, avatar_url: null },
		post_hashtags: [],
		anime_id: null,
		anime: null,
		broadcast_room_session_id: null,
		event_id: null,
		event: null,
	};
}

const NO_MUTES = {
	anime_mutes: { data: [], error: null },
	event_mutes: { data: [], error: null },
};

describe("buildTimelineNextCursor", () => {
	it("returns no cursor when the page came back short of the limit", () => {
		expect(buildTimelineNextCursor([{ id: "a" }], 2, (row) => ({ createdAt: "t", id: row.id }))).toBeNull();
		expect(buildTimelineNextCursor([], 50, () => ({ createdAt: "t", id: "x" }))).toBeNull();
	});

	it("builds the cursor from the last row of a full page", () => {
		const rows = [{ id: "a" }, { id: "b" }];
		expect(buildTimelineNextCursor(rows, 2, (row) => ({ createdAt: `t-${row.id}`, id: row.id }))).toEqual({
			createdAt: "t-b",
			id: "b",
		});
	});
});

describe("getHomeTimelinePosts pagination with mutes", () => {
	it("keeps the next cursor from the pre-filter rows even when mutes shrink the page", async () => {
		const rows = Array.from({ length: 5 }, (_, i) => rawPost(i, i === 4 ? "spoiler inside" : `post ${i}`));
		const supabase = fakeSupabase(
			{
				posts: { data: rows, error: null },
				muted_words: { data: [{ word: "spoiler" }], error: null },
				...NO_MUTES,
			},
			{ get_post_counts: { data: [], error: null } },
		);

		const result = await getHomeTimelinePosts(supabase, "viewer", { limit: 5 });

		expect(result.error).toBeNull();
		expect(result.posts.map((post) => post.id)).toEqual(["post-00", "post-01", "post-02", "post-03"]);
		// 除外された post-04 が最終行なので、その位置からカーソルを作る（読み飛ばしなし）
		expect(result.nextCursor).toEqual({ createdAt: "2026-09-28T10:04:00.000Z", id: "post-04" });
	});

	it("still offers a next page when every fetched post is muted", async () => {
		const rows = Array.from({ length: 3 }, (_, i) => rawPost(i, "spoiler everywhere"));
		const supabase = fakeSupabase(
			{
				posts: { data: rows, error: null },
				muted_words: { data: [{ word: "spoiler" }], error: null },
				...NO_MUTES,
			},
			{ get_post_counts: { data: [], error: null } },
		);

		const result = await getHomeTimelinePosts(supabase, "viewer", { limit: 3 });

		expect(result.posts).toEqual([]);
		expect(result.nextCursor).toEqual({ createdAt: "2026-09-28T10:02:00.000Z", id: "post-02" });
	});

	it("reports the end of the timeline when the database returned fewer rows than the limit", async () => {
		const supabase = fakeSupabase(
			{
				posts: { data: [rawPost(0), rawPost(1)], error: null },
				muted_words: { data: [], error: null },
				...NO_MUTES,
			},
			{ get_post_counts: { data: [], error: null } },
		);

		const result = await getHomeTimelinePosts(supabase, "viewer", { limit: 5 });

		expect(result.posts).toHaveLength(2);
		expect(result.nextCursor).toBeNull();
	});

	it("returns no cursor on a query error", async () => {
		const supabase = fakeSupabase({ posts: { data: null, error: { message: "boom" } } }, {});
		const result = await getHomeTimelinePosts(supabase, "viewer", { limit: 5 });
		expect(result.error).toEqual({ message: "boom" });
		expect(result.nextCursor).toBeNull();
	});
});

describe("getFollowingTimelinePosts pagination with mutes", () => {
	it("derives the cursor from the RPC ordering keys before mute filtering", async () => {
		const timelineRows = [
			{
				post_id: "post-00",
				timeline_created_at: "2026-09-28T10:00:00.000Z",
				repost_user_id: null,
				reposted_at: null,
			},
			{
				post_id: "post-01",
				timeline_created_at: "2026-09-28T09:59:00.000Z",
				repost_user_id: "reposter",
				reposted_at: "2026-09-28T09:59:00.000Z",
			},
		];
		const supabase = fakeSupabase(
			{
				posts: { data: [rawPost(0), rawPost(1, "spoiler")], error: null },
				profiles: {
					data: [{ id: "reposter", username: "rp", display_name: null, avatar_url: null }],
					error: null,
				},
				muted_words: { data: [{ word: "spoiler" }], error: null },
				...NO_MUTES,
			},
			{ get_following_timeline: { data: timelineRows, error: null }, get_post_counts: { data: [], error: null } },
		);

		const result = await getFollowingTimelinePosts(supabase, "viewer", { limit: 2 });

		expect(result.error).toBeNull();
		expect(result.posts.map((post) => post.id)).toEqual(["post-00"]);
		expect(result.nextCursor).toEqual({ createdAt: "2026-09-28T09:59:00.000Z", id: "post-01" });
	});

	it("returns no cursor when the RPC page is short", async () => {
		const supabase = fakeSupabase(
			{
				posts: { data: [rawPost(0)], error: null },
				muted_words: { data: [], error: null },
				...NO_MUTES,
			},
			{
				get_following_timeline: {
					data: [{ post_id: "post-00", timeline_created_at: "t", repost_user_id: null, reposted_at: null }],
					error: null,
				},
				get_post_counts: { data: [], error: null },
			},
		);

		const result = await getFollowingTimelinePosts(supabase, "viewer", { limit: 50 });
		expect(result.posts).toHaveLength(1);
		expect(result.nextCursor).toBeNull();
	});
});
