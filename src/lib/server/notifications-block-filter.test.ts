import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { getNotifications } from "./queries";

const CHAIN_METHODS = ["select", "eq", "order", "limit", "in", "not", "or"] as const;

/** notifications へのクエリで呼ばれたフィルターを記録しつつ、await で空の結果を返す */
function recordingSupabase(blockedUserIds: string[]) {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain = Promise.resolve({ data: [], error: null }) as Promise<unknown> & Record<string, unknown>;
	for (const method of CHAIN_METHODS) {
		chain[method] = (...args: unknown[]) => {
			calls.push({ method, args });
			return chain;
		};
	}
	const client = {
		from: vi.fn(() => chain),
		rpc: vi.fn(async () => ({ data: blockedUserIds.map((user_id) => ({ user_id })), error: null })),
	};
	return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("getNotifications のブロック除外", () => {
	it("actor_id が NULL のシステム通知（放送・トレード成立）は残す", async () => {
		const { client, calls } = recordingSupabase(["blocked-1", "blocked-2"]);
		await getNotifications(client, "me");

		// NOT IN は NULL を落とすので、NULL を明示的に許可した OR 条件で絞る
		expect(calls).toContainEqual({
			method: "or",
			args: ["actor_id.is.null,actor_id.not.in.(blocked-1,blocked-2)"],
		});
		expect(calls.some((call) => call.method === "not")).toBe(false);
	});

	it("ブロック相手がいなければ actor_id で絞らない", async () => {
		const { client, calls } = recordingSupabase([]);
		await getNotifications(client, "me");
		expect(calls.some((call) => call.method === "or" || call.method === "not")).toBe(false);
	});
});
