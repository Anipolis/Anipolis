import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { PUT } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";

function makeEvent(body: unknown, options: { user?: { id: string } | null; rpcError?: { code: string } } = {}) {
	const calls: unknown[] = [];
	const supabase = {
		rpc: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return { data: null, error: options.rpcError ?? null };
		},
	};
	const event = {
		request: new Request("http://localhost/api/favorite-anime", {
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

describe("ベスト作品の保存", () => {
	it("送られた順番のまま DB に渡す", async () => {
		const { event, calls } = makeEvent({ animeIds: [30, 10, 20] });
		expect(await statusOf(PUT(event))).toBe(200);
		expect(calls).toEqual([{ name: "set_favorite_anime", args: { p_anime_ids: [30, 10, 20] } }]);
	});

	it("空にすると全部外す", async () => {
		const { event, calls } = makeEvent({ animeIds: [] });
		expect(await statusOf(PUT(event))).toBe(200);
		expect(calls).toEqual([{ name: "set_favorite_anime", args: { p_anime_ids: [] } }]);
	});

	it.each([
		["11件", { animeIds: Array.from({ length: 11 }, (_, i) => i + 1) }],
		["重複", { animeIds: [1, 1] }],
		["数でない", { animeIds: ["1"] }],
		["配列でない", { animeIds: 1 }],
	])("%s は断る", async (_label, body) => {
		const { event, calls } = makeEvent(body);
		expect(await statusOf(PUT(event))).toBe(400);
		expect(calls).toEqual([]);
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
