import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { getEpisodeRoomLog } from "./queries";

type Result = { data: unknown; error: { message: string } | null };

const CHAIN = ["select", "eq", "in", "is", "not", "order", "range"] as const;

/** テーブルごとに、呼ばれた順に結果を返す（broadcast_room_sessions は「話数ルームの枠」→「つながっていない枠」の順） */
function fakeSupabase(tables: Record<string, Result[]>) {
	const postQueries: unknown[][] = [];
	const from = vi.fn((table: string) => {
		const queue = tables[table];
		const result = queue && queue.length > 1 ? queue.shift() : queue?.[0];
		if (!result) throw new Error(`unexpected table: ${table}`);
		const chain = Promise.resolve(result) as Promise<Result> & Record<string, (...args: unknown[]) => unknown>;
		for (const method of CHAIN) {
			chain[method] = (...args: unknown[]) => {
				if (table === "posts" && method === "in") postQueries.push(args);
				return chain;
			};
		}
		return chain;
	});
	return { client: { from } as unknown as SupabaseClient<Database>, postQueries };
}

const unroomed = (id: string, room_date: string) => ({ id, room_date });

describe("getEpisodeRoomLog: 話数ルームに入っていない放送日", () => {
	it("投稿のある枠の日付だけを返す（投稿の無い枠は、話数ルームと二重に並ぶので出さない）", async () => {
		const { client, postQueries } = fakeSupabase({
			episode_rooms: [{ data: [], error: null }],
			broadcast_room_sessions: [
				{ data: [], error: null },
				{
					data: [unroomed("s1", "2026-04-02"), unroomed("s2", "2026-04-09"), unroomed("s3", "2026-04-16")],
					error: null,
				},
			],
			posts: [{ data: [{ broadcast_room_session_id: "s2" }, { broadcast_room_session_id: "s2" }], error: null }],
			broadcast_room_overrides: [{ data: [], error: null }],
		});

		const log = await getEpisodeRoomLog(client, 54);

		expect(log?.unroomedDates).toEqual(["2026-04-09"]);
		expect(postQueries).toEqual([["broadcast_room_session_id", ["s1", "s2", "s3"]]]);
	});

	it("つながっていない枠が無ければ、投稿を調べない", async () => {
		const { client, postQueries } = fakeSupabase({
			episode_rooms: [{ data: [], error: null }],
			broadcast_room_sessions: [
				{ data: [], error: null },
				{ data: [], error: null },
			],
			posts: [{ data: [], error: null }],
			broadcast_room_overrides: [{ data: [], error: null }],
		});

		const log = await getEpisodeRoomLog(client, 54);

		expect(log?.unroomedDates).toEqual([]);
		expect(postQueries).toEqual([]);
	});

	it("投稿の確認に失敗したら、空の一覧ではなく失敗（null）を返す", async () => {
		const { client } = fakeSupabase({
			episode_rooms: [{ data: [], error: null }],
			broadcast_room_sessions: [
				{ data: [], error: null },
				{ data: [unroomed("s1", "2026-04-02")], error: null },
			],
			posts: [{ data: null, error: { message: "timeout" } }],
			broadcast_room_overrides: [{ data: [], error: null }],
		});
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await getEpisodeRoomLog(client, 54)).toBeNull();
		spy.mockRestore();
	});
});
