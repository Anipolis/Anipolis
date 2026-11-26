import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import type { RawPost } from "#lib/types.ts";
import { chainableRpc } from "../../test/chainable-rpc.ts";

vi.mock("#lib/server/post-image-signing.ts", () => ({
	signPostImageUrls: async (urls: string[]) =>
		new Map(urls.map((url) => [url, `https://signed.example/${url.split("/").pop()}`])),
}));

import { enrichPostsWithCounts, quotedPostImageUrls } from "./queries";

const CHAIN_METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "gt", "gte", "lt", "not", "range"] as const;
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

describe("enrichPostsWithCounts の引用枠（#290）", () => {
	const STORAGE = "https://project.supabase.co/storage/v1/object/public/post-images";

	function quotingPost(): RawPost {
		return {
			id: "00000000-0000-4000-8000-000000000010",
			user_id: "quoter",
			parent_id: null,
			quoted_post_id: "00000000-0000-4000-8000-000000000020",
			content: "これ見て",
			created_at: "2026-11-26T12:00:00.000Z",
			image_urls: [],
			profiles: { username: "quoter", display_name: null, avatar_url: null },
			post_hashtags: [],
			anime_id: null,
			anime: null,
			broadcast_room_session_id: null,
			event_id: null,
			event: null,
		} as unknown as RawPost;
	}

	function quotedRow(overrides: Record<string, unknown> = {}) {
		return {
			id: "00000000-0000-4000-8000-000000000020",
			content: "",
			created_at: "2026-11-26T11:00:00.000Z",
			user_id: "author",
			image_urls: [`${STORAGE}/author/1760000000000-a.png`, `${STORAGE}/author/1760000000000-b.png`],
			anime_id: null,
			anime: null,
			quoted_post_id: null,
			cw_anime_id: null,
			cw_anime: null,
			profiles: { username: "author", display_name: null, avatar_url: null },
			...overrides,
		};
	}

	/** posts テーブル（引用元の取得）だけ行を返し、選んだ列を記録する */
	function clientWithQuoted(row: unknown, mutedWords: string[] = []) {
		const selects: string[] = [];
		const client = {
			from: (table: string) => {
				const data =
					table === "posts" ? [row] : table === "muted_words" ? mutedWords.map((word) => ({ word })) : [];
				const chain = Promise.resolve({ data, error: null }) as Promise<unknown> &
					Record<string, (...args: unknown[]) => unknown>;
				for (const method of CHAIN_METHODS) {
					chain[method] = (...args: unknown[]) => {
						if (method === "select" && table === "posts") selects.push(String(args[0]));
						return chain;
					};
				}
				return chain;
			},
			rpc: vi.fn(chainableRpc(async () => ({ data: [], error: null }))),
		} as unknown as SupabaseClient<Database>;
		return { client, selects };
	}

	it("引用元の画像・作品名を取り、画像は期限付きの URL に差し替える", async () => {
		const { client, selects } = clientWithQuoted(
			quotedRow({ anime_id: 7, anime: { id: 7, title: "夜空のレコード" } }),
		);
		const [post] = await enrichPostsWithCounts(client, [quotingPost()], "viewer");
		expect(selects[0]).toContain("image_urls");
		expect(selects[0]).toContain("anime:anime!posts_anime_id_fkey ( id, title )");
		// 自己参照の JOIN は使わない（CLAUDE.md）
		expect(selects[0]).not.toContain("posts_quoted_post_id_fkey");
		expect(post?.quoted_post?.image_urls).toEqual([
			"https://signed.example/1760000000000-a.png",
			"https://signed.example/1760000000000-b.png",
		]);
		expect(post?.quoted_post?.anime).toEqual({ id: "7", title: "夜空のレコード" });
		expect(post?.quoted_post?.anime_id).toBe("7");
	});

	it("引用元に CW があれば、画像の URL をページに渡さない", async () => {
		const { client } = clientWithQuoted(quotedRow({ cw_anime_id: 42, cw_anime: null }));
		const [post] = await enrichPostsWithCounts(client, [quotingPost()], "viewer");
		expect(post?.quoted_post?.image_urls).toEqual([]);
		expect(post?.quoted_post?.cw_anime_id).toBe("42");
	});

	it("引用元の作品名にミュートワードがあれば、本体の作品名と同じく隠す", async () => {
		const { client } = clientWithQuoted(quotedRow({ anime_id: 7, anime: { id: 7, title: "夜空のレコード" } }), [
			"夜空",
		]);
		expect(await enrichPostsWithCounts(client, [quotingPost()], "viewer")).toEqual([]);
	});
});

describe("quotedPostImageUrls（#290）", () => {
	const STORAGE = "https://project.supabase.co/storage/v1/object/public/post-images";
	const own = (name: string) => `${STORAGE}/author/1760000000000-${name}.png`;

	it("引用元の投稿者自身の画像だけを、最大4枚まで残す", () => {
		expect(
			quotedPostImageUrls({
				user_id: "author",
				image_urls: [own("a"), `${STORAGE}/victim/1760000000000-x.png`, own("b"), own("c"), own("d"), own("e")],
				cw_anime_id: null,
				cw_anime: null,
			}),
		).toEqual([own("a"), own("b"), own("c"), own("d")]);
	});

	it("CW の作品だけが取れた引用元（ID なし）でも画像を出さない", () => {
		expect(
			quotedPostImageUrls({
				user_id: "author",
				image_urls: [own("a")],
				cw_anime_id: null,
				cw_anime: [{ title: "x" }],
			}),
		).toEqual([]);
	});

	it("画像の無い引用元は空", () => {
		expect(quotedPostImageUrls({ user_id: "author", image_urls: null, cw_anime_id: null, cw_anime: null })).toEqual(
			[],
		);
	});
});
