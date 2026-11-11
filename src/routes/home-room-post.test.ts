import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Anime, EpisodeRoom } from "$lib/types";

const insertPostWithHashtags = vi.hoisted(() => vi.fn());
const getAnime = vi.hoisted(() => vi.fn());
const resolveComposerEpisodeRoom = vi.hoisted(() => vi.fn());

vi.mock("$lib/server/actions", () => ({
	insertPostWithHashtags,
	deletePostAction: vi.fn(),
	toggleBookmarkAction: vi.fn(),
	toggleLikeAction: vi.fn(),
	toggleRepostAction: vi.fn(),
}));
vi.mock("$lib/server/queries", () => ({ getAnime, getAnimeExchangeShareForUser: vi.fn() }));
vi.mock("$lib/server/episode-room-page", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/server/episode-room-page")>()),
	resolveComposerEpisodeRoom,
}));

import { actions } from "./+page.server";

const anime = { id: "41", title: "作品", official_hashtag: ["作品タグ"] } as unknown as Anime;
const openRoom = { id: "room-5", kind: "episode", merged_into: null, opens_at: "2020-01-01T00:00:00Z" } as EpisodeRoom;

function createPost(fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request("http://localhost/?/createPost", { method: "POST", body });
	const locals = {
		supabase: {},
		safeGetSession: async () => ({ session: {}, user: { id: "user-1" } }),
	};
	return (actions["createPost"] as (event: unknown) => Promise<unknown>)({ request, locals });
}

beforeEach(() => {
	vi.clearAllMocks();
	insertPostWithHashtags.mockResolvedValue({ success: true, postId: "post-1" });
	getAnime.mockResolvedValue(anime);
	resolveComposerEpisodeRoom.mockResolvedValue(openRoom);
});

describe("ホームの投稿欄から話数ルームに投稿する", () => {
	it("話数を指定すると、その話数ルームの投稿として作品のハッシュタグを付けて保存する", async () => {
		await createPost({ content: "きた", anime_id: "41", room_anime_id: "41", room_episode: "5" });
		expect(resolveComposerEpisodeRoom).toHaveBeenCalledWith(expect.anything(), 41, { episodeNumber: 5 });
		const args = insertPostWithHashtags.mock.calls[0] ?? [];
		expect(args[8]).toBeNull(); // 放送枠は付けない（放送時間内なら DB が補う）
		expect(args[10]).toEqual(["作品タグ"]);
		expect(args[12]).toBe("room-5");
	});

	it("特番ルームは special_key で探す", async () => {
		await createPost({ content: "x", anime_id: "41", room_anime_id: "41", room_special_key: "recap" });
		expect(resolveComposerEpisodeRoom).toHaveBeenCalledWith(expect.anything(), 41, { specialKey: "recap" });
	});

	it("まだ開いていないルームには投稿させない", async () => {
		resolveComposerEpisodeRoom.mockResolvedValue({ ...openRoom, opens_at: null });
		const result = (await createPost({ content: "x", anime_id: "41", room_anime_id: "41", room_episode: "9" })) as {
			status: number;
		};
		expect(result.status).toBe(403);
		expect(insertPostWithHashtags).not.toHaveBeenCalled();
	});

	it("引用した作品とルームの作品が違う・放送枠と話数を両方指定した・話数がおかしいときは断る", async () => {
		const cases = [
			{ content: "x", anime_id: "99", room_anime_id: "41", room_episode: "5" },
			{ content: "x", anime_id: "41", room_anime_id: "41", room_episode: "5", broadcast_room_session_id: "s1" },
			{ content: "x", anime_id: "41", room_anime_id: "41", room_episode: "0" },
		];
		for (const fields of cases) {
			const result = (await createPost(fields)) as { status: number };
			expect(result.status).toBe(400);
		}
		expect(insertPostWithHashtags).not.toHaveBeenCalled();
	});

	it("ルームを指定しない投稿は今までどおり", async () => {
		await createPost({ content: "ふつうの投稿" });
		expect(resolveComposerEpisodeRoom).not.toHaveBeenCalled();
		const args = insertPostWithHashtags.mock.calls[0] ?? [];
		expect(args[10]).toEqual([]);
		expect(args[12]).toBeNull();
	});
});
