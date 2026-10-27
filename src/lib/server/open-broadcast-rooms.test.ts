import { describe, expect, it } from "vitest";
import { getOpenBroadcastRoomSessions } from "./queries";

function makeSupabase(rows: unknown[]) {
	const query = {
		select: () => query,
		lte: () => query,
		gte: () => query,
		eq: () => query,
		order: () => query,
		// biome-ignore lint/suspicious/noThenProperty: Supabase のクエリと同じく await で結果を返す
		then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
	};
	return { from: () => query } as unknown as Parameters<typeof getOpenBroadcastRoomSessions>[0];
}

const lobby = (id: string, anime: unknown) => ({
	id,
	anime_id: 1,
	room_date: "2026-10-27",
	room_kind: "global",
	room_key: `global:${id}`,
	scheduled_at: "2026-10-27T00:00:00Z",
	schedule_source: null,
	anime,
});

describe("開いているルームの一覧", () => {
	it("作品を読めない総合ロビー（情報がまだそろっていない作品など）は出さない", async () => {
		const rooms = await getOpenBroadcastRoomSessions(
			makeSupabase([
				lobby("hidden", null),
				lobby("visible", {
					id: 1,
					title: "見える作品",
					cover_url: null,
					aired_from: null,
					aired_to: null,
					broadcast_day: null,
				}),
			]),
		);
		expect(rooms.map((room) => room.id)).toEqual(["visible"]);
		expect(rooms[0]?.anime?.title).toBe("見える作品");
	});
});
