import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";
import { enrichPostsWithCounts } from "./queries";

const CHAIN_METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "gt", "gte", "lt", "not"] as const;

/** どのテーブルも空で返す（ミュート・ブロック・マイリスト等の付随取得用） */
function emptyChain() {
	const chain = Promise.resolve({ data: [], error: null }) as Promise<unknown> & Record<string, () => unknown>;
	for (const method of CHAIN_METHODS) chain[method] = () => chain;
	return chain;
}

function rawPost(index: number): RawPost {
	const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
	return {
		id,
		user_id: "author",
		parent_id: null,
		quoted_post_id: null,
		content: `post ${index}`,
		created_at: "2026-10-13T12:00:00.000Z",
		image_urls: [],
		profiles: { username: "author", display_name: null, avatar_url: null },
		post_hashtags: [],
		anime_id: null,
		anime: null,
		broadcast_room_session_id: null,
		event_id: null,
		event: null,
	} as unknown as RawPost;
}

/** 本番の get_post_counts と同じく、200件を超える配列は例外にする */
function fakeSupabase(failFirstCall = false) {
	let calls = 0;
	const rpc = vi.fn(async (name: string, args: { p_post_ids?: string[] }) => {
		if (name === "get_blocked_user_ids") return { data: [], error: null };
		if (name !== "get_post_counts") throw new Error(`unexpected rpc: ${name}`);
		calls++;
		const ids = args.p_post_ids ?? [];
		if (ids.length > 200) return { data: null, error: { message: "too many post ids (max 200)" } };
		if (failFirstCall && calls === 1) return { data: null, error: { message: "temporary failure" } };
		return {
			data: ids.map((post_id) => ({
				post_id,
				like_count: 3,
				repost_count: 1,
				reply_count: 2,
				liked_by_me: true,
				reposted_by_me: false,
				bookmarked_by_me: true,
			})),
			error: null,
		};
	});
	return { client: { from: () => emptyChain(), rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("enrichPostsWithCounts の get_post_counts 分割（#323）", () => {
	it("200件を超えても上限ごとに分けて取り、全件の件数と自分の反応を保つ", async () => {
		const { client, rpc } = fakeSupabase();
		const posts = await enrichPostsWithCounts(
			client,
			Array.from({ length: 201 }, (_, i) => rawPost(i)),
			"viewer",
		);

		expect(posts).toHaveLength(201);
		expect(posts.every((p) => p.like_count === 3 && p.liked_by_me && p.bookmarked_by_me)).toBe(true);
		const sizes = rpc.mock.calls
			.filter(([name]) => name === "get_post_counts")
			.map(([, args]) => (args as { p_post_ids: string[] }).p_post_ids.length);
		expect(sizes.sort((a, b) => b - a)).toEqual([200, 1]);
	});

	it("200件ちょうどは1回で取る", async () => {
		const { client, rpc } = fakeSupabase();
		await enrichPostsWithCounts(
			client,
			Array.from({ length: 200 }, (_, i) => rawPost(i)),
			"viewer",
		);
		expect(rpc.mock.calls.filter(([name]) => name === "get_post_counts")).toHaveLength(1);
	});

	it("一時的な失敗は1回やり直して、件数を0や未操作に置き換えない", async () => {
		const { client } = fakeSupabase(true);
		const posts = await enrichPostsWithCounts(client, [rawPost(0)], "viewer");
		expect(posts[0]?.liked_by_me).toBe(true);
		expect(posts[0]?.like_count).toBe(3);
	});
});
