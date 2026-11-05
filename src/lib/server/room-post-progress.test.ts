import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Anime, EpisodeRoom } from "$lib/types";

const insertPostWithHashtags = vi.hoisted(() => vi.fn());
const advanceMylistProgressFromRoom = vi.hoisted(() => vi.fn());

vi.mock("$lib/server/actions", () => ({ insertPostWithHashtags }));
vi.mock("$lib/server/queries", () => ({ advanceMylistProgressFromRoom }));

import { createEpisodeRoomPost, undoRoomProgressAdvance } from "./episode-room-page";

const anime = { id: "41", title: "作品", episode_total: 12 } as unknown as Anime;
const room = (over: Partial<EpisodeRoom> = {}) =>
	({
		id: "room-1",
		kind: "episode",
		episode_number: 5,
		merged_into: null,
		opens_at: "2020-01-01T00:00:00Z",
		...over,
	}) as unknown as EpisodeRoom;

const postRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return new Request("http://localhost/rooms/anime/41/ep/5?/createPost", { method: "POST", body });
};

const post = (r: EpisodeRoom, fields: Record<string, string> = { content: "きた" }) =>
	createEpisodeRoomPost({
		supabase: {} as App.Locals["supabase"],
		userId: "user-1",
		request: postRequest(fields),
		anime,
		room: r,
	});

beforeEach(() => {
	vi.clearAllMocks();
	insertPostWithHashtags.mockResolvedValue({ success: true, postId: "post-1" });
	advanceMylistProgressFromRoom.mockResolvedValue({ from: 2, to: 5 });
});

describe("話数ルームへの投稿で話数を進める", () => {
	it("投稿できたらルームの話数で進め、進んだ話数を返す", async () => {
		const result = await post(room());
		expect(advanceMylistProgressFromRoom).toHaveBeenCalledWith(expect.anything(), 41, 5);
		expect(result).toEqual({
			success: true,
			postId: "post-1",
			progressAdvance: { from: 2, to: 5, total: 12 },
		});
	});

	it("進まなかったら投稿の結果だけを返す", async () => {
		advanceMylistProgressFromRoom.mockResolvedValue(null);
		expect(await post(room())).toEqual({ success: true, postId: "post-1" });
	});

	it("投稿に失敗したら進めない", async () => {
		const { fail } = await import("@sveltejs/kit");
		insertPostWithHashtags.mockResolvedValue(fail(429, { message: "多すぎます" }));
		await post(room());
		expect(advanceMylistProgressFromRoom).not.toHaveBeenCalled();
	});

	it("特番ルームでは進めない", async () => {
		await post(room({ kind: "special", episode_number: null }));
		expect(advanceMylistProgressFromRoom).not.toHaveBeenCalled();
	});

	it("元に戻したあとの投稿では進めない", async () => {
		await post(room(), { content: "きた", keep_progress: "1" });
		expect(insertPostWithHashtags).toHaveBeenCalled();
		expect(advanceMylistProgressFromRoom).not.toHaveBeenCalled();
	});
});

describe("進んだ話数を元に戻す", () => {
	const undo = (fields: Record<string, string>) => {
		const eq = vi.fn();
		const chain = { update: vi.fn(() => chain), eq: eq.mockImplementation(() => chain), error: null };
		const supabase = { from: vi.fn(() => chain) } as unknown as App.Locals["supabase"];
		return {
			chain,
			eq,
			run: undoRoomProgressAdvance({ supabase, userId: "user-1", request: postRequest(fields), animeId: 41 }),
		};
	};

	it("進めた話数のままのときだけ戻す", async () => {
		const { chain, eq, run } = undo({ from: "2", to: "5" });
		expect(await run).toEqual({ success: true });
		expect(chain.update).toHaveBeenCalledWith({ progress: 2 });
		expect(eq).toHaveBeenCalledWith("user_id", "user-1");
		expect(eq).toHaveBeenCalledWith("anime_id", 41);
		expect(eq).toHaveBeenCalledWith("progress", 5);
	});

	it("不正な話数は受け付けない", async () => {
		for (const fields of [{ from: "5", to: "2" }, { from: "-1", to: "2" }, { from: "a", to: "2" }, { from: "2" }]) {
			const { chain, run } = undo(fields);
			expect(await run).toMatchObject({ status: 400 });
			expect(chain.update).not.toHaveBeenCalled();
		}
	});
});

describe("進める関数（188）", () => {
	const sql = readFileSync(
		new URL("../../../supabase/migrations/188_room_post_advances_progress.sql", import.meta.url),
		"utf8",
	);

	it("本人の権限で動き、未ログインでは呼べない", () => {
		expect(sql).toContain("SECURITY INVOKER");
		expect(sql).toContain("FROM PUBLIC, anon;");
		expect(sql).not.toMatch(/GRANT EXECUTE[^;]*\banon\b/);
	});

	it("視聴中の作品だけを対象にし、登録や状態は変えない", () => {
		expect(sql).toContain("AND l.status = 'watching'");
		expect(sql).toContain("SET progress = target");
		expect(sql).not.toMatch(/INSERT INTO|SET status/);
	});

	it("通算の話数を読み替え、話数を減らさない", () => {
		expect(sql).toContain("target := p_episode_number - COALESCE(season_start, 1) + 1;");
		expect(sql).toContain("target <= current_progress");
		expect(sql).toContain("target > total");
	});
});
