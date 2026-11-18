import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import { getHashtagPostsPage } from "./queries";

type Result = { data: unknown; error: unknown };

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** posts は呼ばれた in の ID の行を返し、それ以外のテーブル（ミュート設定など）は空を返す */
function fakeSupabase(pageRows: { id: string; created_at: string }[] | null, rpcError: unknown = null) {
	const inCalls: unknown[][] = [];
	const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
	const from = vi.fn((table: string) => {
		let result: Result = { data: [], error: null };
		// フィルターは await の前に同期で呼ばれるので、結果はマイクロタスクで確定させる
		let settle: (value: Result) => void = () => {};
		const chain = new Promise<Result>((resolve) => {
			settle = resolve;
		}) as Promise<Result> & Record<string, (...args: unknown[]) => unknown>;
		queueMicrotask(() => settle(result));
		for (const method of [
			"select",
			"eq",
			"order",
			"limit",
			"or",
			"is",
			"not",
			"neq",
			"gt",
			"range",
			"maybeSingle",
		]) {
			chain[method] = () => chain;
		}
		chain["in"] = (...args: unknown[]) => {
			if (table === "posts") {
				inCalls.push(args);
				// 読み出し順は RPC の並びと違っていてもよい（並べ直すのはアプリ側）
				const ids = [...(args[1] as string[])].reverse();
				result = {
					data: ids.map((id) => ({
						id,
						user_id: "author",
						content: id,
						created_at: "2026-11-01T00:00:00Z",
						image_urls: [],
						profiles: { username: "author", display_name: null, avatar_url: null },
						post_hashtags: [],
					})),
					error: null,
				};
			}
			return chain;
		};
		return chain;
	});
	const rpc = vi.fn((name: string, args: Record<string, unknown> = {}) => {
		rpcCalls.push({ name, args });
		const value: Result =
			name === "get_hashtag_post_page" ? { data: pageRows, error: rpcError } : { data: [], error: null };
		const promise = Promise.resolve(value) as Promise<Result> & Record<string, () => unknown>;
		promise["order"] = () => promise;
		promise["range"] = () => promise;
		return promise;
	});
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, inCalls, rpcCalls };
}

const rows = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: UUID(i + 1),
		created_at: `2026-11-${String(20 - i).padStart(2, "0")}T00:00:00Z`,
	}));

describe("getHashtagPostsPage（#248）", () => {
	it("タグは小文字にして RPC に渡し、返った ID（1ページ分）だけを posts から読んで RPC の並びに並べる", async () => {
		const { client, inCalls, rpcCalls } = fakeSupabase(rows(3));
		const page = await getHashtagPostsPage(client, "AniTag", null, undefined, 3);
		expect(rpcCalls.find((c) => c.name === "get_hashtag_post_page")?.args).toEqual({ p_tag: "anitag", p_limit: 3 });
		expect(inCalls).toEqual([["id", [UUID(1), UUID(2), UUID(3)]]]);
		expect(page.posts.map((post) => post.id)).toEqual([UUID(1), UUID(2), UUID(3)]);
	});

	it("満杯のページなら最後の行を次の目印にする。目印は RPC に渡す", async () => {
		const { client, rpcCalls } = fakeSupabase(rows(2));
		const page = await getHashtagPostsPage(
			client,
			"tag",
			null,
			{ createdAt: "2026-11-30T00:00:00Z", id: UUID(99) },
			2,
		);
		expect(rpcCalls.find((c) => c.name === "get_hashtag_post_page")?.args).toEqual({
			p_tag: "tag",
			p_before_created_at: "2026-11-30T00:00:00Z",
			p_before_id: UUID(99),
			p_limit: 2,
		});
		expect(page.nextCursor).toEqual({ createdAt: rows(2)[1]?.created_at, id: UUID(2) });
	});

	it("足りないページなら続きは無い。0件なら posts を読まない", async () => {
		const { client, inCalls } = fakeSupabase([]);
		const page = await getHashtagPostsPage(client, "tag", null);
		expect(page).toEqual({ posts: [], error: null, nextCursor: null });
		expect(inCalls).toHaveLength(0);
	});

	it("RPC が失敗したら error を返す（空の一覧と見せない）", async () => {
		const { client } = fakeSupabase(null, { message: "boom" });
		const page = await getHashtagPostsPage(client, "tag", null);
		expect(page.error).toEqual({ message: "boom" });
	});
});

describe("208 get_hashtag_post_page", () => {
	const migration = readFileSync(
		new URL("../../../supabase/migrations/208_hashtag_post_page.sql", import.meta.url),
		"utf8",
	);

	it("RLS が効くよう SECURITY INVOKER で、ログインした人だけが呼べる", () => {
		expect(migration).toContain("SECURITY INVOKER");
		expect(migration).not.toContain("SECURITY DEFINER");
		expect(migration).toContain(
			"REVOKE ALL ON FUNCTION public.get_hashtag_post_page(text, timestamptz, uuid, integer) FROM PUBLIC, anon;",
		);
	});

	it("タグの投稿と中止されていないイベントの投稿を UNION で重複なく合わせ、（作成日時, ID）の新しい順に返す", () => {
		expect(migration).toMatch(/WHERE h\.name = p_tag/);
		expect(migration).toMatch(/WHERE e\.hashtag = p_tag\s+AND e\.is_cancelled = false/);
		expect(migration).toMatch(/SELECT \* FROM tagged\s+UNION\s+SELECT \* FROM from_events/);
		expect(migration).toMatch(/ORDER BY u\.created_at DESC, u\.id DESC/);
		expect(migration.match(/\(p\.created_at, p\.id\) < \(p_before_created_at, p_before_id\)/g)).toHaveLength(2);
	});

	it("件数は 1〜100 に丸める", () => {
		expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)");
	});
});
