import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { PUT } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const COLLECTION = "22222222-2222-4222-8222-222222222222";

function makeEvent(body: unknown, options: { user?: { id: string } | null; rpcError?: { code: string } } = {}) {
	const calls: unknown[] = [];
	const supabase = {
		rpc: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return { data: null, error: options.rpcError ?? null };
		},
	};
	const event = {
		params: { id: COLLECTION },
		request: new Request("http://localhost/api/collections/x/tiers", {
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

describe("ティア表の段の保存", () => {
	it("名前の前後の空白を落とし、元の段の番号と一緒に DB に渡す", async () => {
		const { event, calls } = makeEvent({ tiers: [" 神 ", "B"], origins: [null, 2] });
		expect(await statusOf(PUT(event))).toBe(200);
		expect(calls).toEqual([
			{
				name: "set_collection_tiers",
				args: { p_collection_id: COLLECTION, p_tiers: ["神", "B"], p_origins: [null, 2] },
			},
		]);
	});

	it.each([
		["段が無い", { tiers: [], origins: [] }],
		["空の名前", { tiers: [" "], origins: [0] }],
		["11文字", { tiers: ["あ".repeat(11)], origins: [0] }],
		["11段", { tiers: Array.from({ length: 11 }, (_, i) => `T${i}`), origins: Array(11).fill(null) }],
		["元の番号の数が合わない", { tiers: ["S", "A"], origins: [0] }],
		["元の番号が範囲外", { tiers: ["S"], origins: [10] }],
		["名前が文字でない", { tiers: [1], origins: [0] }],
	])("%s は断る", async (_label, body) => {
		const { event, calls } = makeEvent(body);
		expect(await statusOf(PUT(event))).toBe(400);
		expect(calls).toEqual([]);
	});

	it("ログインしていなければ断る", async () => {
		const { event } = makeEvent({ tiers: ["S"], origins: [0] }, { user: null });
		expect(await statusOf(PUT(event))).toBe(401);
	});

	it("自分のものでないコレクションは見つからない扱い", async () => {
		const { event } = makeEvent({ tiers: ["S"], origins: [0] }, { rpcError: { code: "P0002" } });
		expect(await statusOf(PUT(event))).toBe(404);
	});
});
