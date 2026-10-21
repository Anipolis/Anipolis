import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/queries", () => ({
	getRoomPostsAfter: vi.fn(async () => ({ posts: [], nextCursor: null, hasMore: false })),
	getRoomPostsBefore: vi.fn(async () => ({ posts: [], nextCursor: null, hasMore: false })),
	getVisiblePostReplyCounts: vi.fn(
		async (_supabase: unknown, ids: string[]) => new Map(ids.slice(1).map((id) => [id, 2])),
	),
}));

import { getRoomPostsAfter, getRoomPostsBefore, getVisiblePostReplyCounts } from "$lib/server/queries";
import { ROOM_STATE_MAX_IDS } from "$lib/utils/room-connection";
import { GET } from "./+server";
import { POST } from "./state/+server";

const SESSION = "11111111-1111-4111-8111-111111111111";
const POST_ID = "22222222-2222-4222-8222-222222222222";

function get(query: string) {
	const event = {
		url: new URL(`http://localhost/api/rooms/posts?${query}`),
		locals: { supabase: {}, safeGetSession: async () => ({ user: null, session: null }) },
	};
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

function postState(body: unknown) {
	const event = {
		request: new Request("http://localhost/api/rooms/posts/state", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
		locals: { supabase: {} },
	};
	return POST(event as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	vi.mocked(getRoomPostsAfter).mockClear();
	vi.mocked(getRoomPostsBefore).mockClear();
});

describe("GET /api/rooms/posts（#320）", () => {
	it("話数ルーム（episode_room_id）の差分も取れる", async () => {
		const res = await get(`episode_room_id=${SESSION}`);
		expect(res.status).toBe(200);
		expect(getRoomPostsAfter).toHaveBeenCalledWith(
			expect.anything(),
			{ kind: "episode_room", id: SESSION },
			null,
			null,
			100,
		);
	});

	it("before_* で境界より前（古い側）を読み足す", async () => {
		const res = await get(
			`episode_room_id=${SESSION}&before_created_at=2026-10-13T12:00:00.000Z&before_id=${POST_ID}`,
		);
		expect(res.status).toBe(200);
		expect(getRoomPostsBefore).toHaveBeenCalledWith(
			expect.anything(),
			{ kind: "episode_room", id: SESSION },
			null,
			{ createdAt: "2026-10-13T12:00:00.000Z", id: POST_ID },
			100,
		);
		expect(getRoomPostsAfter).not.toHaveBeenCalled();
		// 前後の境界は同時に指定できない
		const both = await get(
			`episode_room_id=${SESSION}&before_created_at=2026-10-13T12:00:00.000Z&before_id=${POST_ID}&after_created_at=2026-10-13T12:00:00.000Z&after_id=${POST_ID}`,
		);
		expect(both.status).toBe(400);
	});

	it("ルームの指定はちょうど一つ", async () => {
		expect((await get("")).status).toBe(400);
		expect((await get(`session_id=${SESSION}&episode_room_id=${SESSION}`)).status).toBe(400);
		expect((await get("episode_room_id=not-a-uuid")).status).toBe(400);
		expect(getRoomPostsAfter).not.toHaveBeenCalled();
	});

	it("取得済みの境界（created_at と id）より後ろから取る", async () => {
		const res = await get(`session_id=${SESSION}&after_created_at=2026-10-13T12:00:00.000Z&after_id=${POST_ID}`);
		expect(res.status).toBe(200);
		expect(getRoomPostsAfter).toHaveBeenCalledWith(
			expect.anything(),
			{ kind: "broadcast", id: SESSION },
			null,
			{ createdAt: "2026-10-13T12:00:00.000Z", id: POST_ID },
			100,
		);
		expect(await res.json()).toEqual({ posts: [], nextCursor: null, hasMore: false });
	});

	it("旧クライアントの since は「その時刻より後」と同じ意味の境界にする", async () => {
		await get(`event_id=${SESSION}&since=2026-10-13T12:00:00.000Z`);
		expect(getRoomPostsAfter).toHaveBeenCalledWith(
			expect.anything(),
			{ kind: "event", id: SESSION },
			null,
			{ createdAt: "2026-10-13T12:00:00.000Z", id: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
			100,
		);
	});

	it("境界の片方だけ・不正な値は 400", async () => {
		expect((await get(`session_id=${SESSION}&after_created_at=2026-10-13T12:00:00.000Z`)).status).toBe(400);
		expect((await get(`session_id=${SESSION}&after_created_at=x&after_id=${POST_ID}`)).status).toBe(400);
		expect(getRoomPostsAfter).not.toHaveBeenCalled();
	});
});

describe("POST /api/rooms/posts/state（#324）", () => {
	it("今も見える投稿の返信数だけを返す（見えなくなった投稿は含めない）", async () => {
		const hiddenId = "33333333-3333-4333-8333-333333333333";
		const res = await postState({ ids: [hiddenId, POST_ID] });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ visible: { [POST_ID]: 2 } });
		expect(getVisiblePostReplyCounts).toHaveBeenCalledWith(expect.anything(), [hiddenId, POST_ID]);
	});

	it("ID の形式・件数の上限を検査する", async () => {
		expect((await postState({ ids: ["not-a-uuid"] })).status).toBe(400);
		expect((await postState({ ids: Array(ROOM_STATE_MAX_IDS + 1).fill(POST_ID) })).status).toBe(400);
		expect((await postState({})).status).toBe(400);
	});
});
