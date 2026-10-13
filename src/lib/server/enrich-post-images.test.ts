import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import type { RawPost } from "$lib/types";

vi.mock("$lib/server/post-image-signing", () => ({
	signPostImageUrls: async (urls: string[]) =>
		new Map(urls.map((url) => [url, `https://signed.example/${url.split("/").pop()}`])),
}));

import { enrichPostsWithCounts } from "./queries";

const CHAIN_METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "gt", "gte", "lt", "not"] as const;
function emptyChain() {
	const chain = Promise.resolve({ data: [], error: null }) as Promise<unknown> & Record<string, () => unknown>;
	for (const method of CHAIN_METHODS) chain[method] = () => chain;
	return chain;
}

describe("enrichPostsWithCounts の投稿画像（#316）", () => {
	it("読めた投稿の画像を、ページに出す期限付き URL に差し替える", async () => {
		const stored = "https://project.supabase.co/storage/v1/object/public/post-images/author/1760000000000-a.png";
		const raw = {
			id: "00000000-0000-4000-8000-000000000001",
			user_id: "author",
			parent_id: null,
			quoted_post_id: null,
			content: "画像つき",
			created_at: "2026-10-13T12:00:00.000Z",
			image_urls: [stored],
			profiles: { username: "author", display_name: null, avatar_url: null },
			post_hashtags: [],
			anime_id: null,
			anime: null,
			broadcast_room_session_id: null,
			event_id: null,
			event: null,
		} as unknown as RawPost;
		const client = {
			from: () => emptyChain(),
			rpc: vi.fn(async () => ({ data: [], error: null })),
		} as unknown as SupabaseClient<Database>;

		const [post] = await enrichPostsWithCounts(client, [raw], null);
		expect(post?.image_urls).toEqual(["https://signed.example/1760000000000-a.png"]);
	});

	it("他人の画像を参照している投稿からは、その画像を出さない（PR #380 レビュー）", async () => {
		const own = "https://project.supabase.co/storage/v1/object/public/post-images/author/1760000000000-own.png";
		const foreign = "https://project.supabase.co/storage/v1/object/public/post-images/victim/1760000000000-x.png";
		const external = "https://evil.example.com/x.png";
		const raw = {
			id: "00000000-0000-4000-8000-000000000002",
			user_id: "author",
			parent_id: null,
			quoted_post_id: null,
			content: "他人の画像",
			created_at: "2026-10-13T12:00:00.000Z",
			image_urls: [own, foreign, external],
			profiles: { username: "author", display_name: null, avatar_url: null },
			post_hashtags: [],
			anime_id: null,
			anime: null,
			broadcast_room_session_id: null,
			event_id: null,
			event: null,
		} as unknown as RawPost;
		const client = {
			from: () => emptyChain(),
			rpc: vi.fn(async () => ({ data: [], error: null })),
		} as unknown as SupabaseClient<Database>;

		const [post] = await enrichPostsWithCounts(client, [raw], null);
		expect(post?.image_urls).toEqual(["https://signed.example/1760000000000-own.png"]);
	});
});
