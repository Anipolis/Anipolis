import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import { insertPostWithHashtags } from "./actions";

type TableChain = Record<string, unknown>;

function maybeSingleChain(response: unknown): TableChain {
	const chain = {
		select: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		maybeSingle: vi.fn(async () => response),
	};
	return chain;
}

function createInsertPostClient(
	roomAnime: { title: string | null; official_hashtag: string[] | null } | null,
	eventHashtag: string | null = null,
) {
	const insertedPosts: unknown[] = [];
	const hashtagUpsert = vi.fn(async () => ({ error: null }));
	const postHashtagUpsert = vi.fn(async () => ({ error: null }));
	const hashtagSelect = vi.fn(() => ({
		in: vi.fn(async (_column: string, names: string[]) => ({
			data: names.map((_name, index) => ({ id: index + 1 })),
			error: null,
		})),
	}));

	const client = {
		from: vi.fn((table: string) => {
			if (table === "account_moderation") {
				return maybeSingleChain({ data: null, error: null });
			}
			if (table === "broadcast_room_sessions") {
				return maybeSingleChain({ data: { anime: roomAnime }, error: null });
			}
			if (table === "events") {
				return maybeSingleChain({ data: eventHashtag ? { hashtag: eventHashtag } : null, error: null });
			}
			if (table === "posts") {
				return {
					insert: vi.fn((payload: unknown) => {
						insertedPosts.push(payload);
						return {
							select: vi.fn(() => ({
								single: vi.fn(async () => ({ data: { id: "post-1" }, error: null })),
							})),
						};
					}),
				};
			}
			if (table === "hashtags") {
				return {
					upsert: hashtagUpsert,
					select: hashtagSelect,
				};
			}
			if (table === "post_hashtags") {
				return { upsert: postHashtagUpsert };
			}
			throw new Error(`unexpected table: ${table}`);
		}),
	};

	return {
		client: client as unknown as SupabaseClient<Database>,
		hashtagUpsert,
		postHashtagUpsert,
		insertedPosts,
	};
}

describe("insertPostWithHashtags", () => {
	it("adds the room-link anime hashtag to trend metadata", async () => {
		const { client, hashtagUpsert, postHashtagUpsert, insertedPosts } = createInsertPostClient({
			title: "Room Anime",
			official_hashtag: ["#OfficialTag"],
		});

		const result = await insertPostWithHashtags(
			client,
			"user-1",
			"plain room post",
			null,
			[],
			"123",
			null,
			null,
			"session-1",
		);

		expect(result).toEqual({ success: true, postId: "post-1" });
		expect(insertedPosts).toContainEqual(expect.objectContaining({ broadcast_room_session_id: "session-1" }));
		expect(hashtagUpsert).toHaveBeenCalledWith([{ name: "officialtag" }], {
			onConflict: "name",
			ignoreDuplicates: true,
		});
		expect(postHashtagUpsert).toHaveBeenCalledWith([{ post_id: "post-1", hashtag_id: 1 }], {
			onConflict: "post_id,hashtag_id",
			ignoreDuplicates: true,
		});
	});

	it("adds the event room-link hashtag to trend metadata", async () => {
		const { client, hashtagUpsert, postHashtagUpsert, insertedPosts } = createInsertPostClient(null, "#EventRoom");

		const result = await insertPostWithHashtags(
			client,
			"user-1",
			"plain event post",
			null,
			[],
			"123",
			null,
			null,
			null,
			null,
			[],
			"event-1",
		);

		expect(result).toEqual({ success: true, postId: "post-1" });
		expect(insertedPosts).toContainEqual(expect.objectContaining({ event_id: "event-1" }));
		expect(hashtagUpsert).toHaveBeenCalledWith([{ name: "eventroom" }], {
			onConflict: "name",
			ignoreDuplicates: true,
		});
		expect(postHashtagUpsert).toHaveBeenCalledWith([{ post_id: "post-1", hashtag_id: 1 }], {
			onConflict: "post_id,hashtag_id",
			ignoreDuplicates: true,
		});
	});

	it("rejects more than 4 attached images", async () => {
		const { client, insertedPosts } = createInsertPostClient(null);
		const ownUrl = (n: number) =>
			`https://example.supabase.co/storage/v1/object/public/post-images/user-1/${n}.png`;

		const result = await insertPostWithHashtags(client, "user-1", "too many images", null, [
			ownUrl(1),
			ownUrl(2),
			ownUrl(3),
			ownUrl(4),
			ownUrl(5),
		]);

		expect(result).toMatchObject({ status: 400 });
		expect(insertedPosts).toHaveLength(0);
	});

	it("rejects image URLs outside the poster's own post-images folder", async () => {
		const { client, insertedPosts } = createInsertPostClient(null);
		const foreignUrls = [
			"https://example.supabase.co/storage/v1/object/public/post-images/user-2/steal.png",
			"https://evil.example.com/image.png",
		];

		for (const url of foreignUrls) {
			const result = await insertPostWithHashtags(client, "user-1", "bad image", null, [url]);
			expect(result).toMatchObject({ status: 400 });
		}
		expect(insertedPosts).toHaveLength(0);
	});

	it("accepts up to 4 images from the poster's own folder", async () => {
		const { client, insertedPosts } = createInsertPostClient(null);
		const urls = [1, 2, 3, 4].map(
			(n) => `https://example.supabase.co/storage/v1/object/public/post-images/user-1/${n}.png`,
		);

		const result = await insertPostWithHashtags(client, "user-1", "with images", null, urls);

		expect(result).toEqual({ success: true, postId: "post-1" });
		expect(insertedPosts).toContainEqual(expect.objectContaining({ image_urls: urls }));
	});
});
