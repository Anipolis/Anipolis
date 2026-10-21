import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import {
	addEpisodeAiringAction,
	addSpecialRoomAction,
	mergeEpisodeRoomsAction,
	parseJstDateTime,
} from "./episode-room-admin";

function form(values: Record<string, string>) {
	const fd = new FormData();
	for (const [key, value] of Object.entries(values)) fd.set(key, value);
	return fd;
}

describe("parseJstDateTime", () => {
	it("datetime-local を日本時間として ISO にする。空は null、形式違いや存在しない日付は undefined", () => {
		expect(parseJstDateTime("2026-10-20T23:30")).toBe("2026-10-20T14:30:00.000Z");
		expect(parseJstDateTime("")).toBeNull();
		expect(parseJstDateTime("2026-10-20 23:30")).toBeUndefined();
		expect(parseJstDateTime("2026-02-30T10:00")).toBeUndefined();
	});
});

describe("addSpecialRoomAction", () => {
	it("URL の名前と表示名を確かめ、開く時刻を決めたら固定して作る", async () => {
		const insert = vi.fn(async () => ({ error: null }));
		const admin = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>;
		expect(await addSpecialRoomAction(admin, 1, form({ special_key: "Recap 1", label: "総集編" }))).toMatchObject({
			status: 400,
		});
		const ok = await addSpecialRoomAction(
			admin,
			1,
			form({ special_key: "recap-1", label: "総集編", opens_at: "2026-10-20T23:30" }),
		);
		expect(ok).toMatchObject({ roomSuccess: true });
		expect(insert).toHaveBeenCalledWith({
			anime_id: 1,
			kind: "special",
			special_key: "recap-1",
			label: "総集編",
			opens_at: "2026-10-20T14:30:00.000Z",
			opens_at_locked: true,
		});
	});
});

describe("addEpisodeAiringAction", () => {
	it("放送日は朝4時区切りで数え、開場5分前・受付は放送の30分後まで", async () => {
		const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const admin = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient<Database>;
		const result = await addEpisodeAiringAction(
			admin,
			1,
			form({
				episode_number: "3",
				airing_kind: "rerun",
				scheduled_at: "2026-10-21T01:30",
				duration_minutes: "30",
			}),
		);
		expect(result).toMatchObject({ roomSuccess: true });
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			// 10/21 1:30 の深夜放送は 10/20 の放送
			room_date: "2026-10-20",
			room_key: "2026-10-20",
			scheduled_at: "2026-10-20T16:30:00.000Z",
			posting_opens_at: "2026-10-20T16:25:00.000Z",
			posting_closes_at: "2026-10-20T17:30:00.000Z",
			episode_number: 3,
			airing_kind: "rerun",
		});
	});

	it("同じ日に放送枠があれば知らせる", async () => {
		const admin = {
			from: vi.fn(() => ({ insert: async () => ({ error: { code: "23505" } }) })),
		} as unknown as SupabaseClient<Database>;
		const result = await addEpisodeAiringAction(
			admin,
			1,
			form({ episode_number: "3", airing_kind: "event", scheduled_at: "2026-10-21T20:00" }),
		);
		expect(result).toMatchObject({ status: 409 });
	});
});

describe("mergeEpisodeRoomsAction", () => {
	it("放送枠のあるルームは統合せず、話数の訂正を案内する", async () => {
		const rooms = [
			{ id: "r4", episode_number: 4, merged_into: null },
			{ id: "r3", episode_number: 3, merged_into: null },
		];
		const update = vi.fn();
		const admin = {
			from: vi.fn((table: string) => {
				if (table === "episode_rooms") {
					return {
						select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: rooms }) }) }) }),
						update,
					};
				}
				return { select: () => ({ eq: async () => ({ count: 1 }) }), update };
			}),
		} as unknown as SupabaseClient<Database>;
		const result = await mergeEpisodeRoomsAction(admin, 1, form({ from_episode: "4", to_episode: "3" }));
		expect(result).toMatchObject({ status: 400 });
		expect(update).not.toHaveBeenCalled();
	});
});
