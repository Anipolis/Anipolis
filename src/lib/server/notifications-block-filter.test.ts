import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import { getNotificationPage, getUnreadNotificationCount } from "./queries";

const CHAIN_METHODS = ["select", "eq", "order", "limit", "in", "not", "or", "lte"] as const;

/** notifications へのクエリで呼ばれたフィルターを記録しつつ、await で空の結果を返す */
function recordingSupabase() {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain = Promise.resolve({ data: [], error: null, count: 0 }) as Promise<unknown> & Record<string, unknown>;
	for (const method of CHAIN_METHODS) {
		chain[method] = (...args: unknown[]) => {
			calls.push({ method, args });
			return chain;
		};
	}
	const from = vi.fn((_table: string) => chain);
	const rpc = vi.fn();
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls, from, rpc };
}

const migration = readFileSync(
	new URL("../../../supabase/migrations/206_notifications_hide_muted_blocked_actors.sql", import.meta.url),
	"utf8",
);

describe("通知のミュート・ブロック除外（#558）", () => {
	it("一覧はミュート・ブロック相手の ID を読まず、URL に並べない（RLS の 206 に任せる）", async () => {
		const { client, calls, from, rpc } = recordingSupabase();
		await getNotificationPage(client, "me");
		expect(calls.some((call) => call.method === "or")).toBe(false);
		expect(from.mock.calls.map(([table]) => table)).toEqual(["notifications"]);
		expect(rpc).not.toHaveBeenCalled();
	});

	it("未読数もミュート相手の ID を読まず、URL に並べない", async () => {
		const { client, calls, from } = recordingSupabase();
		await getUnreadNotificationCount(client, "me");
		expect(calls.some((call) => call.method === "or")).toBe(false);
		expect(from.mock.calls.map(([table]) => table)).toEqual(["notifications"]);
	});

	it("206 は SELECT に RESTRICTIVE で効かせ、システム通知は残す", () => {
		expect(migration).toMatch(/ON public\.notifications\s+AS RESTRICTIVE\s+FOR SELECT\s+TO authenticated/);
		expect(migration).toMatch(/USING \(\s+actor_id IS NULL\s+OR \(/);
	});

	it("自分がミュートした相手と、どちら向きのブロックも除く", () => {
		expect(migration).toMatch(/m\.muter_id = \(SELECT auth\.uid\(\)\)\s+AND m\.muted_id = notifications\.actor_id/);
		expect(migration).toContain("AND NOT public.is_blocked_between((SELECT auth.uid()), actor_id)");
	});
});
