import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { DELETE, POST } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const COLLECTION = "22222222-2222-4222-8222-222222222222";

type Options = {
	user?: { id: string } | null;
	id?: string;
	animeId?: string;
	/** 今のコレクションの作品（null なら自分のコレクションが見つからない） */
	items?: number[] | null;
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
			data: items ? { id: COLLECTION, items: items.map((anime_id, position) => ({ anime_id, position })) } : null,
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
		expect(await response.json()).toEqual({ success: true, itemCount: 3 });
		expect(calls).toEqual([
			{ name: "set_collection_items", args: { p_collection_id: COLLECTION, p_anime_ids: [10, 20, 30] } },
		]);
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
