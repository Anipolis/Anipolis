import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";
import { enrichPostsWithCounts, getNotifications } from "./queries";

type TableResult = { data: unknown; error: { message: string } | null };

const CHAIN_METHODS = ["select", "is", "order", "limit", "or", "eq", "in", "not", "neq", "maybeSingle"] as const;

/** どのフィルターを挟んでも await でテーブルごとの結果を返す。or() に渡した条件は記録する */
function fakeSupabase(tables: Record<string, TableResult>) {
	const orFilters: string[] = [];
	const from = vi.fn((table: string) => {
		const result = tables[table];
		if (!result) throw new Error(`unexpected table: ${table}`);
		const chain = Promise.resolve(result) as Promise<TableResult> & Record<string, (...args: unknown[]) => unknown>;
		for (const method of CHAIN_METHODS) {
			chain[method] = (...args: unknown[]) => {
				if (method === "or") orFilters.push(String(args[0]));
				return chain;
			};
		}
		return chain;
	});
	const rpc = vi.fn(async () => ({ data: [], error: null }));
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, orFilters };
}

function rawPost(id: string, userId: string, repostBy: string | null = null): RawPost {
	return {
		id,
		user_id: userId,
		parent_id: null,
		quoted_post_id: null,
		content: `post ${id}`,
		created_at: "2026-11-07T10:00:00.000Z",
		image_urls: [],
		profiles: { username: userId, display_name: null, avatar_url: null },
		post_hashtags: [],
		anime_id: null,
		anime: null,
		broadcast_room_session_id: null,
		event_id: null,
		event: null,
		repost_context: repostBy
			? {
					user_id: repostBy,
					username: repostBy,
					display_name: null,
					avatar_url: null,
					created_at: "2026-11-07T11:00:00.000Z",
				}
			: null,
	} as unknown as RawPost;
}

const tables = (muted: string[]) => ({
	muted_words: { data: [], error: null },
	anime_mutes: { data: [], error: null },
	event_mutes: { data: [], error: null },
	user_mutes: { data: muted.map((id) => ({ muted_id: id })), error: null },
});

const posts = () => [
	rawPost("a", "friend"),
	rawPost("b", "muted"),
	// ミュートした人がリポストした、別の人の投稿
	rawPost("c", "friend", "muted"),
	// 別の人がリポストした、ミュートした人の投稿
	rawPost("d", "muted", "friend"),
];

describe("アカウントのミュート（191）", () => {
	it("ミュートした人の投稿とリポストを一覧から外す", async () => {
		const { client } = fakeSupabase(tables(["muted"]));
		const result = await enrichPostsWithCounts(client, posts(), "viewer");
		expect(result.map((post) => post.id)).toEqual(["a"]);
	});

	it("入室中のルームでもミュートを効かせる", async () => {
		const { client } = fakeSupabase(tables(["muted"]));
		const result = await enrichPostsWithCounts(client, posts(), "viewer", { includeMutedRoomPosts: true });
		expect(result.map((post) => post.id)).toEqual(["a"]);
	});

	it("その人のプロフィールや投稿を開いたときは、その人の投稿を見せる", async () => {
		const { client } = fakeSupabase(tables(["muted", "other"]));
		const result = await enrichPostsWithCounts(client, [...posts(), rawPost("e", "other")], "viewer", {
			showMutedUserId: "muted",
		});
		// 他にミュートしている人（other）の投稿は引き続き隠す
		expect(result.map((post) => post.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("見せる相手を外しても、同じリクエストの他の一覧ではミュートが効いたまま", async () => {
		const { client } = fakeSupabase(tables(["muted"]));
		await enrichPostsWithCounts(client, posts(), "viewer", { showMutedUserId: "muted" });
		const result = await enrichPostsWithCounts(client, posts(), "viewer");
		expect(result.map((post) => post.id)).toEqual(["a"]);
	});

	it("自分のブックマーク・いいねではミュートを効かせない", async () => {
		const { client } = fakeSupabase(tables(["muted"]));
		const result = await enrichPostsWithCounts(client, posts(), "viewer", { includeMutedUsers: true });
		expect(result.map((post) => post.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("ミュートした人からの通知を出さない（システム通知は残す）", async () => {
		const { client, orFilters } = fakeSupabase({
			...tables(["muted"]),
			notifications: { data: [], error: null },
		});
		await getNotifications(client, "viewer");
		expect(orFilters).toContain("actor_id.is.null,actor_id.not.in.(muted)");
	});
});

describe("191 の migration", () => {
	const sql = readFileSync(new URL("../../../supabase/migrations/191_user_mutes.sql", import.meta.url), "utf8");

	it("本人の行だけ読み書きでき、自分はミュートできない", () => {
		expect(sql).toContain("USING (auth.uid() = muter_id)");
		expect(sql).toContain("auth.uid() = muter_id\n        AND public.has_beta_write_access()");
		expect(sql).toContain("CHECK (muter_id <> muted_id)");
		expect(sql).toContain("REVOKE ALL ON public.user_mutes FROM anon;");
	});

	it("フォロー中タイムラインは、重複を除く前にミュートした人の投稿とリポストを外す", () => {
		const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_following_timeline"));
		const events = fn.slice(0, fn.indexOf("deduplicated AS"));
		expect(events).toContain("m.muted_id = p.user_id");
		expect(events).toContain("m.muted_id = r.user_id");
		expect(fn).toContain("SECURITY INVOKER");
	});
});
