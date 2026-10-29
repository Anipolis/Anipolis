import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { PUT } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const COLLECTION = "22222222-2222-4222-8222-222222222222";

function makeEvent(
	body: unknown,
	options: { user?: { id: string } | null; id?: string; rpcError?: { code: string } } = {},
) {
	const calls: unknown[] = [];
	const supabase = {
		rpc: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return { data: null, error: options.rpcError ?? null };
		},
	};
	const event = {
		params: { id: options.id ?? COLLECTION },
		request: new Request("http://localhost/api/collections/x/items", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		locals: {
			supabase,
			safeGetSession: async () => ({ user: options.user === undefined ? { id: USER } : options.user }),
		},
	};
	return { event: event as unknown as Parameters<typeof PUT>[0], calls };
}

async function statusOf(promise: Response | Promise<Response>) {
	try {
		return (await promise).status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe("コレクションの作品の保存", () => {
	it("送られた順番のまま DB に渡す", async () => {
		const { event, calls } = makeEvent({ animeIds: [30, 10, 20] });
		expect(await statusOf(PUT(event))).toBe(200);
		expect(calls).toEqual([
			{ name: "set_collection_items", args: { p_collection_id: COLLECTION, p_anime_ids: [30, 10, 20] } },
		]);
	});

	it.each([
		["101件", { animeIds: Array.from({ length: 101 }, (_, i) => i + 1) }],
		["重複", { animeIds: [1, 1] }],
		["数でない", { animeIds: ["1"] }],
		["配列でない", { animeIds: 1 }],
	])("%s は断る", async (_label, body) => {
		const { event, calls } = makeEvent(body);
		expect(await statusOf(PUT(event))).toBe(400);
		expect(calls).toEqual([]);
	});

	it("ID の形でなければ 404（DB に問い合わせない）", async () => {
		const { event, calls } = makeEvent({ animeIds: [1] }, { id: "not-a-uuid" });
		expect(await statusOf(PUT(event))).toBe(404);
		expect(calls).toEqual([]);
	});

	it("自分のものでないコレクションは 404", async () => {
		const { event } = makeEvent({ animeIds: [1] }, { rpcError: { code: "P0002" } });
		expect(await statusOf(PUT(event))).toBe(404);
	});

	it("読めない作品が含まれていたら 400", async () => {
		const { event } = makeEvent({ animeIds: [1] }, { rpcError: { code: "22023" } });
		expect(await statusOf(PUT(event))).toBe(400);
	});

	it("ログインしていなければ 401", async () => {
		const { event, calls } = makeEvent({ animeIds: [1] }, { user: null });
		expect(await statusOf(PUT(event))).toBe(401);
		expect(calls).toEqual([]);
	});
});
