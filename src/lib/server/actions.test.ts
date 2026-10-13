import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "$lib/supabase/database.types";
import {
	blockUserAction,
	createInviteErrorStatus,
	ensureNotBlocked,
	getAnimeExchangeErrorDetail,
	insertPostWithHashtags,
	requireAccountCanWrite,
	unblockUserAction,
} from "./actions";

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

	it("アップロードから7日を過ぎた画像は、回収されうるので受け付けない（#330）", async () => {
		const { client, insertedPosts } = createInsertPostClient(null);
		const uuid = "0b7c6a8e-5d4f-4a3b-9c2d-1e0f9a8b7c6d";
		const base = "https://example.supabase.co/storage/v1/object/public/post-images/user-1";
		const expired = `${base}/${Date.now() - 8 * 24 * 60 * 60 * 1000}-${uuid}.png`;
		const fresh = `${base}/${Date.now() - 60_000}-${uuid}.png`;

		const rejected = await insertPostWithHashtags(client, "user-1", "old image", null, [expired]);
		expect(rejected).toMatchObject({
			status: 400,
			data: { message: "添付画像の有効期限が切れました。画像をもう一度添付してください" },
		});
		expect(insertedPosts).toEqual([]);

		const accepted = await insertPostWithHashtags(client, "user-1", "new image", null, [fresh]);
		expect(accepted).toEqual({ success: true, postId: "post-1" });
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

describe("getAnimeExchangeErrorDetail", () => {
	it("recognizes the beta and account-status rejections raised by migration 130", () => {
		expect(getAnimeExchangeErrorDetail({ details: "ANIME_EXCHANGE_FORBIDDEN" })).toBe("ANIME_EXCHANGE_FORBIDDEN");
		expect(getAnimeExchangeErrorDetail({ details: "ANIME_EXCHANGE_ACCOUNT_RESTRICTED" })).toBe(
			"ANIME_EXCHANGE_ACCOUNT_RESTRICTED",
		);
		expect(getAnimeExchangeErrorDetail({ details: "SOMETHING_ELSE" })).toBeNull();
	});
});

describe("requireAccountCanWrite", () => {
	function moderationClient(row: { status: string; restricted_until: string | null } | null) {
		return {
			from: vi.fn((table: string) => {
				if (table !== "account_moderation") throw new Error(`unexpected table: ${table}`);
				return {
					...maybeSingleChain({ data: row, error: null }),
					update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
				};
			}),
		} as unknown as SupabaseClient<Database>;
	}

	it("allows accounts without a moderation row", async () => {
		await expect(requireAccountCanWrite(moderationClient(null), "user-1")).resolves.toBeUndefined();
	});

	it("allows restrictions that have already expired", async () => {
		const client = moderationClient({ status: "restricted", restricted_until: "2000-01-01T00:00:00Z" });
		await expect(requireAccountCanWrite(client, "user-1")).resolves.toBeUndefined();
	});

	it("throws 403 for banned accounts", async () => {
		await expect(
			requireAccountCanWrite(moderationClient({ status: "banned", restricted_until: null }), "user-1"),
		).rejects.toMatchObject({ status: 403, body: { message: "このアカウントはBANされています" } });
	});

	it("fails closed with 503 when the moderation lookup itself fails", async () => {
		const client = {
			from: vi.fn(() => maybeSingleChain({ data: null, error: { message: "connection reset" } })),
		} as unknown as SupabaseClient<Database>;
		await expect(requireAccountCanWrite(client, "user-1")).rejects.toMatchObject({ status: 503 });
	});

	it("throws 403 for accounts restricted into the future", async () => {
		const client = moderationClient({ status: "restricted", restricted_until: "2999-01-01T00:00:00Z" });
		await expect(requireAccountCanWrite(client, "user-1")).rejects.toMatchObject({ status: 403 });
	});
});

describe("ensureNotBlocked", () => {
	function rpcClient(blocked: boolean | null, error: { message: string } | null = null) {
		const rpc = vi.fn(async () => ({ data: blocked, error }));
		return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
	}

	it("ブロック関係があれば 403 を返す", async () => {
		const { client, rpc } = rpcClient(true);
		const failure = await ensureNotBlocked(client, "me", "them");
		expect(failure).toMatchObject({ status: 403 });
		expect(rpc).toHaveBeenCalledWith("is_blocked_between", { user_a: "me", user_b: "them" });
	});

	it("ブロック関係が無ければ null を返す", async () => {
		const { client } = rpcClient(false);
		expect(await ensureNotBlocked(client, "me", "them")).toBeNull();
	});

	it("自分自身と相手不明は照会せずに通す", async () => {
		const { client, rpc } = rpcClient(true);
		expect(await ensureNotBlocked(client, "me", "me")).toBeNull();
		expect(await ensureNotBlocked(client, "me", null)).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});

	it("照会に失敗したら通す（DB 側のポリシーが最終防壁）", async () => {
		const { client } = rpcClient(null, { message: "boom" });
		expect(await ensureNotBlocked(client, "me", "them")).toBeNull();
	});
});

describe("blockUserAction / unblockUserAction", () => {
	function blockClient(options: { targetExists?: boolean; upsertError?: { message: string } | null } = {}) {
		const upsert = vi.fn(async () => ({ error: options.upsertError ?? null }));
		const deleteEq = vi.fn(async () => ({ error: null }));
		const deleted: Record<string, string>[] = [];
		const client = {
			from: vi.fn((table: string) => {
				if (table === "profiles") {
					return {
						select: vi.fn(() => ({
							eq: vi.fn(() => ({
								maybeSingle: vi.fn(async () => ({
									data: options.targetExists === false ? null : { id: "them" },
									error: null,
								})),
							})),
						})),
					};
				}
				if (table === "user_blocks") {
					return {
						upsert,
						delete: vi.fn(() => ({
							eq: vi.fn((columnA: string, valueA: string) => ({
								eq: vi.fn(async (columnB: string, valueB: string) => {
									deleted.push({ [columnA]: valueA, [columnB]: valueB });
									return deleteEq();
								}),
							})),
						})),
					};
				}
				throw new Error(`unexpected table: ${table}`);
			}),
		};
		return { client: client as unknown as SupabaseClient<Database>, upsert, deleted };
	}

	const formRequest = (fields: Record<string, string>) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields)) form.set(key, value);
		return new Request("http://localhost/profile/them", { method: "POST", body: form });
	};

	it("ブロックを記録する（二重送信でも成功扱い）", async () => {
		const { client, upsert } = blockClient();
		const result = await blockUserAction(formRequest({ target_id: "them" }), client, "me");
		expect(result).toEqual({ blocked: true });
		expect(upsert).toHaveBeenCalledWith(
			{ blocker_id: "me", blocked_id: "them" },
			{ onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
		);
	});

	it("自分自身はブロックできない", async () => {
		const { client, upsert } = blockClient();
		const result = await blockUserAction(formRequest({ target_id: "me" }), client, "me");
		expect(result).toMatchObject({ status: 400 });
		expect(upsert).not.toHaveBeenCalled();
	});

	it("存在しないユーザーは 404", async () => {
		const { client } = blockClient({ targetExists: false });
		const result = await blockUserAction(formRequest({ target_id: "ghost" }), client, "me");
		expect(result).toMatchObject({ status: 404 });
	});

	it("ブロック解除は自分の行だけを消す", async () => {
		const { client, deleted } = blockClient();
		const result = await unblockUserAction(formRequest({ target_id: "them" }), client, "me");
		expect(result).toEqual({ blocked: false });
		expect(deleted).toEqual([{ blocker_id: "me", blocked_id: "them" }]);
	});

	it("target_id が無ければ 400", async () => {
		const { client } = blockClient();
		expect(await unblockUserAction(formRequest({}), client, "me")).toMatchObject({ status: 400 });
	});
});

describe("createInviteErrorStatus", () => {
	it("maps an account-status rejection to HTTP 403", () => {
		expect(createInviteErrorStatus({ details: "INVITE_ACCOUNT_RESTRICTED" })).toBe(403);
	});

	it("maps a beta-membership failure to HTTP 403", () => {
		expect(createInviteErrorStatus({ details: "INVITE_FORBIDDEN" })).toBe(403);
	});

	it("keeps the invite creation limit at HTTP 429", () => {
		expect(createInviteErrorStatus({ details: "INVITE_CREATE_LIMIT" })).toBe(429);
	});

	it("keeps unexpected RPC failures at HTTP 500", () => {
		expect(createInviteErrorStatus({ details: "DATABASE_UNAVAILABLE" })).toBe(500);
		expect(createInviteErrorStatus({})).toBe(500);
	});
});
