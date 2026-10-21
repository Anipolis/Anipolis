import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { getEpisodeRoomLog } from "./queries";

type Result = { data: unknown; error: { message: string } | null };

const CHAIN = ["select", "eq", "in", "is", "not", "order", "range", "limit"] as const;

function fakeSupabase(tables: Record<string, Result>) {
	const calls: { table: string; method: string; args: unknown[] }[] = [];
	const from = vi.fn((table: string) => {
		const result = tables[table];
		if (!result) throw new Error(`unexpected table: ${table}`);
		const chain = Promise.resolve(result) as Promise<Result> & Record<string, (...args: unknown[]) => unknown>;
		for (const method of CHAIN) {
			chain[method] = (...args: unknown[]) => {
				calls.push({ table, method, args });
				return chain;
			};
		}
		return chain;
	});
	return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

describe("getEpisodeRoomLog（#484）", () => {
	it("話数ルームと、それにつながった放送枠だけを読む（つながっていない枠・投稿は読まない）", async () => {
		const { client, calls } = fakeSupabase({
			episode_rooms: { data: [], error: null },
			broadcast_room_sessions: { data: [], error: null },
			broadcast_room_overrides: { data: [], error: null },
		});

		const log = await getEpisodeRoomLog(client, 54);

		expect(log).toEqual({ rooms: [], airings: [] });
		expect(calls.some((call) => call.table === "posts")).toBe(false);
		// 放送枠は「話数ルームにつながったもの」だけを読む
		const sessionFilters = calls.filter(
			(call) => call.table === "broadcast_room_sessions" && call.method === "not",
		);
		expect(sessionFilters.map((call) => call.args)).toEqual([["episode_room_id", "is", null]]);
		expect(calls.some((call) => call.table === "broadcast_room_sessions" && call.method === "is")).toBe(false);
	});
});
