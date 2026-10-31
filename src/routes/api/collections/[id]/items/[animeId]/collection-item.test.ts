import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));
vi.mock("$lib/server/queries", () => ({ getAnimeCoverUrl: vi.fn(async (_supabase, id: number) => `cover-${id}`) }));

import { DELETE, POST } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const COLLECTION = "22222222-2222-4222-8222-222222222222";

type Options = {
	user?: { id: string } | null;
	id?: string;
	animeId?: string;
	/** 今のコレクションの作品（null なら自分のコレクションが見つからない） */
	items?: number[] | null;
	/** 中にあるが、非表示などで読めない作品 */
	hidden?: number[];
	/** カバーの無い作品 */
	noCover?: number[];
	rpcError?: { code: string };
};

function makeEvent(options: Options = {}) {
	const calls: unknown[] = [];
	const items = options.items === undefined ? [10, 20] : options.items;
	const query = {
		select: () => query,
		eq: () => query,
		order: () => query,
		maybeSingle: async () => ({
			data: items
				? {
						id: COLLECTION,
						items: items.map((anime_id, position) => ({
							anime_id,
							position,
							anime: options.hidden?.includes(anime_id)
								? null
								: {
										id: anime_id,
										cover_url: options.noCover?.includes(anime_id) ? null : `cover-${anime_id}`,
									},
						})),
					}
				: null,
			error: null,
		}),
	};
	const supabase = {
		from: () => query,
		rpc: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return { data: null, error: options.rpcError ?? null };
		},
	};
	const event = {
		params: { id: options.id ?? COLLECTION, animeId: options.animeId ?? "30" },
		locals: {
			supabase,
			safeGetSession: async () => ({ user: options.user === undefined ? { id: USER } : options.user }),
		},
	};
	return { event: event as unknown as Parameters<typeof POST>[0], calls };
}

async function statusOf(promise: Response | Promise<Response>) {
	try {
		return (await promise).status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe("コレクションへの1作品の出し入れ", () => {
	it("足すときは今の並びの末尾に足して保存する", async () => {
		const { event, calls } = makeEvent();
		const response = await POST(event);
		expect(await response.json()).toEqual({ success: true, itemCount: 3, cover: "cover-10" });
		expect(calls).toEqual([
			{ name: "set_collection_items", args: { p_collection_id: COLLECTION, p_anime_ids: [10, 20, 30] } },
		]);
	});

	it("サムネイルは並びで最初の、カバーのある作品のカバー", async () => {
		const added = makeEvent({ items: [10, 20], noCover: [10] });
		expect(await (await POST(added.event)).json()).toMatchObject({ cover: "cover-20" });
		// 前にカバーのある作品が無ければ、足した作品のカバー
		const first = makeEvent({ items: [] });
		expect(await (await POST(first.event)).json()).toMatchObject({ itemCount: 1, cover: "cover-30" });
		// 外したら残りの先頭、空になれば null
		const removed = makeEvent({ animeId: "10" });
		expect(await (await DELETE(removed.event)).json()).toMatchObject({ cover: "cover-20" });
		const emptied = makeEvent({ items: [10], animeId: "10" });
		expect(await (await DELETE(emptied.event)).json()).toMatchObject({ itemCount: 0, cover: null });
	});

	it("外すときは並びを保ったまま抜いて保存する", async () => {
		const { event, calls } = makeEvent({ animeId: "10" });
		expect(await statusOf(DELETE(event))).toBe(200);
		expect(calls).toEqual([
			{ name: "set_collection_items", args: { p_collection_id: COLLECTION, p_anime_ids: [20] } },
		]);
	});

	it("もう入っている・もう入っていないときは保存しない", async () => {
		const added = makeEvent({ animeId: "10" });
		expect(await statusOf(POST(added.event))).toBe(200);
		const removed = makeEvent({ animeId: "30" });
		expect(await statusOf(DELETE(removed.event))).toBe(200);
		expect([...added.calls, ...removed.calls]).toEqual([]);
	});

	it("後から読めなくなった作品は並びから外して保存する（残すと DB が全体を断る）", async () => {
		const { event, calls } = makeEvent({ items: [10, 20, 40], hidden: [20] });
		const response = await POST(event);
		expect(await response.json()).toEqual({ success: true, itemCount: 3, cover: "cover-10" });
		expect(calls).toEqual([
			{ name: "set_collection_items", args: { p_collection_id: COLLECTION, p_anime_ids: [10, 40, 30] } },
		]);
	});

	it("100作品入っていれば足せない", async () => {
		const { event, calls } = makeEvent({ items: Array.from({ length: 100 }, (_, i) => i + 100) });
		expect(await statusOf(POST(event))).toBe(400);
		expect(calls).toEqual([]);
	});

	it("自分のコレクションでなければ 404", async () => {
		const { event, calls } = makeEvent({ items: null });
		expect(await statusOf(POST(event))).toBe(404);
		expect(calls).toEqual([]);
	});

	it.each([
		["コレクションの ID の形でない", { id: "not-a-uuid" }, 404],
		["作品の ID が数でない", { animeId: "abc" }, 400],
		["ログインしていない", { user: null }, 401],
	] as const)("%s", async (_label, options, status) => {
		const { event, calls } = makeEvent(options);
		expect(await statusOf(POST(event))).toBe(status);
		expect(calls).toEqual([]);
	});

	it("DB が読めない作品として断ったら 400", async () => {
		const { event } = makeEvent({ rpcError: { code: "22023" } });
		expect(await statusOf(POST(event))).toBe(400);
	});
});
