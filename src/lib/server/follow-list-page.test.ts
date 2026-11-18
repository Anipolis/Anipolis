import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import { getFollowListPage } from "./queries";

type Result = { data: unknown; error: { message: string } | null };

function fakeSupabase(result: Result, blocked: string[] = []) {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain = Promise.resolve(result) as Promise<Result> & Record<string, (...args: unknown[]) => unknown>;
	for (const method of ["select", "eq", "order", "limit", "or"]) {
		chain[method] = (...args: unknown[]) => {
			calls.push({ method, args });
			return chain;
		};
	}
	const from = vi.fn((_table: string) => chain);
	// ブロックの ID（get_blocked_user_ids）。range で区切って読む実装（#558）でも、そのまま読む実装でも結果を返す
	const rpc = vi.fn(() => {
		const rpcResult = Promise.resolve({
			data: blocked.map((user_id) => ({ user_id })),
			error: null,
		}) as Promise<Result> & Record<string, () => unknown>;
		rpcResult["order"] = () => rpcResult;
		rpcResult["range"] = () => rpcResult;
		return rpcResult;
	});
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls, from };
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = (n: number) => ({ id: UUID(n), username: `u${n}`, display_name: null, avatar_url: null, bio: null });
const row = (n: number, column = "follower_id") => ({
	created_at: `2026-11-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00Z`,
	[column]: UUID(n),
	user: profile(n),
});

describe("getFollowListPage（#244）", () => {
	it("フォロワーは following_id で絞り、follows と profiles を1回で、フォローした日時の新しい順に取る", async () => {
		const { client, calls, from } = fakeSupabase({ data: [row(1)], error: null });
		await getFollowListPage(client, "followers", "me-profile", null, undefined, 2);
		expect(from.mock.calls.map(([table]) => table)).toEqual(["follows"]);
		expect(String(calls.find((c) => c.method === "select")?.args[0])).toContain(
			"profiles!follows_follower_id_fkey",
		);
		expect(calls).toContainEqual({ method: "eq", args: ["following_id", "me-profile"] });
		expect(calls.filter((c) => c.method === "order").map((c) => c.args)).toEqual([
			["created_at", { ascending: false }],
			["follower_id", { ascending: false }],
		]);
		expect(calls).toContainEqual({ method: "limit", args: [2] });
		// ID を URL に並べない
		expect(calls.some((c) => c.method === "in")).toBe(false);
	});

	it("フォロー中は follower_id で絞り、相手（following_id）を埋め込む", async () => {
		const { client, calls } = fakeSupabase({ data: [], error: null });
		await getFollowListPage(client, "following", "me-profile");
		expect(String(calls.find((c) => c.method === "select")?.args[0])).toContain(
			"profiles!follows_following_id_fkey",
		);
		expect(calls).toContainEqual({ method: "eq", args: ["follower_id", "me-profile"] });
	});

	it("カーソルがあれば、それより前（古い）の行だけを読む", async () => {
		const { client, calls } = fakeSupabase({ data: [], error: null });
		await getFollowListPage(client, "followers", "p", null, { createdAt: "2026-11-15T00:00:00Z", id: UUID(9) });
		expect(calls).toContainEqual({
			method: "or",
			args: [
				`created_at.lt.2026-11-15T00:00:00Z,and(created_at.eq.2026-11-15T00:00:00Z,follower_id.lt.${UUID(9)})`,
			],
		});
	});

	it("満杯のページなら最後の行を次の目印にし、ブロック相手は外しても目印は外す前の行から決める", async () => {
		const { client } = fakeSupabase({ data: [row(1), row(2)], error: null }, [UUID(2)]);
		const page = await getFollowListPage(client, "followers", "p", "viewer", undefined, 2);
		expect(page.users.map((u) => u.username)).toEqual(["u1"]);
		expect(page.nextCursor).toEqual({ createdAt: row(2).created_at, id: UUID(2) });
	});

	it("足りないページなら続きは無い。見えないプロフィール（埋め込みが null）は飛ばす", async () => {
		const { client } = fakeSupabase({ data: [row(1), { ...row(2), user: null }], error: null });
		const page = await getFollowListPage(client, "followers", "p", null, undefined, 5);
		expect(page.users).toHaveLength(1);
		expect(page.nextCursor).toBeNull();
	});

	it("取得に失敗したら投げる（空の一覧と見せない）", async () => {
		const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
		await expect(getFollowListPage(client, "followers", "p")).rejects.toThrow();
	});
});
