import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { toggleBookmarkAction, toggleLikeAction, toggleRepostAction } from "./actions";

/** account_moderation は「制限なし」、対象テーブルは existing の有無を返す最小のクライアント */
function client(existing: boolean, lookupError: { message: string } | null = null) {
	const inserted: string[] = [];
	const deleted: string[] = [];
	// select(...).eq().eq().maybeSingle() と delete().eq().eq() の両方を受ける（await できる Promise に eq を足す）
	const chain = (result: unknown) => {
		const promise = Promise.resolve(result) as Promise<unknown> & {
			eq: () => unknown;
			maybeSingle: () => Promise<unknown>;
		};
		promise.eq = () => promise;
		promise.maybeSingle = async () => result;
		return promise;
	};
	const from = vi.fn((table: string) => ({
		select: () =>
			chain(
				table === "account_moderation"
					? { data: null, error: null }
					: { data: existing ? {} : null, error: lookupError },
			),
		delete: () => {
			deleted.push(table);
			return chain({ error: null });
		},
		insert: async () => {
			inserted.push(table);
			return { error: null };
		},
	}));
	// 操作後の件数（get_post_counts）
	const rpc = vi.fn(async () => ({ data: [{ like_count: 7, repost_count: 3 }], error: null }));
	return { supabase: { from, rpc } as unknown as SupabaseClient<Database>, inserted, deleted };
}

function request(intent?: string) {
	const form = new FormData();
	form.set("post_id", "post-1");
	if (intent) form.set("intent", intent);
	return new Request("http://localhost", { method: "POST", body: form });
}

describe.each([
	{ action: toggleLikeAction, table: "likes", key: "liked", count: 7 },
	{ action: toggleBookmarkAction, table: "bookmarks", key: "bookmarked", count: undefined },
	{ action: toggleRepostAction, table: "reposts", key: "reposted", count: 3 },
])("$table のリアクション（#383 Codex レビュー）", ({ action, table, key, count }) => {
	it("いいね・リポストは操作後の件数も返す（表示していた件数が取得の失敗で 0 でも正しくなる）", async () => {
		const c = client(false);
		const result = (await action(request("on"), c.supabase, "user-1")) as Record<string, unknown>;
		expect(result["count"]).toBe(count);
	});

	it("intent=on なら、すでに反応済みでも解除しない", async () => {
		const c = client(true);
		expect(await action(request("on"), c.supabase, "user-1")).toMatchObject({ [key]: true });
		expect(c.deleted).toEqual([]);
	});

	it("intent=off なら、未反応のときに付けない", async () => {
		const c = client(false);
		expect(await action(request("off"), c.supabase, "user-1")).toMatchObject({ [key]: false });
		expect(c.inserted).toEqual([]);
	});

	it("intent どおりに付け外しする", async () => {
		const on = client(false);
		expect(await action(request("on"), on.supabase, "user-1")).toMatchObject({ [key]: true });
		expect(on.inserted).toEqual([table]);
		const off = client(true);
		expect(await action(request("off"), off.supabase, "user-1")).toMatchObject({ [key]: false });
		expect(off.deleted).toEqual([table]);
	});

	it("状態の照会に失敗したら、何もせず失敗を返す（成功扱いにしない）", async () => {
		for (const intent of ["on", "off", undefined]) {
			const c = client(false, { message: "network" });
			const result = await action(request(intent), c.supabase, "user-1");
			expect(result).toMatchObject({ status: 500 });
			expect(c.inserted).toEqual([]);
			expect(c.deleted).toEqual([]);
		}
	});

	it("intent の無い古いクライアントは今どおり反転する", async () => {
		const c = client(true);
		expect(await action(request(), c.supabase, "user-1")).toMatchObject({ [key]: false });
		expect(c.deleted).toEqual([table]);
	});
});
