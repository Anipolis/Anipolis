import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { POST } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";
const COPY = "33333333-3333-4333-8333-333333333333";

function makeEvent(
	options: {
		id?: string;
		user?: { id: string } | null;
		rpc?: { data: unknown; error: { code: string; message: string } | null };
	} = {},
) {
	const calls: unknown[] = [];
	const supabase = {
		rpc: async (name: string, args: unknown) => {
			calls.push({ name, args });
			return options.rpc ?? { data: COPY, error: null };
		},
	};
	const event = {
		params: { id: options.id ?? SOURCE },
		locals: {
			supabase,
			safeGetSession: async () => ({ user: options.user === undefined ? { id: USER } : options.user }),
		},
	};
	return { event: event as unknown as Parameters<typeof POST>[0], calls };
}

async function run(promise: Response | Promise<Response>) {
	try {
		const res = await promise;
		return { status: res.status, body: await res.json() };
	} catch (thrown) {
		const err = thrown as { status: number; body?: { message?: string } };
		return { status: err.status, body: err.body };
	}
}

describe("コレクションの取り込み", () => {
	it("DB の関数で写し、できたコレクションの ID を返す", async () => {
		const { event, calls } = makeEvent();
		expect(await run(POST(event))).toEqual({ status: 200, body: { id: COPY } });
		expect(calls).toEqual([{ name: "copy_collection", args: { p_source_id: SOURCE } }]);
	});

	it("ログインしていなければ断る", async () => {
		const { event, calls } = makeEvent({ user: null });
		expect((await run(POST(event))).status).toBe(401);
		expect(calls).toEqual([]);
	});

	it("ID の形でなければ見つからない扱い", async () => {
		const { event, calls } = makeEvent({ id: "nope" });
		expect((await run(POST(event))).status).toBe(404);
		expect(calls).toEqual([]);
	});

	it("見られないコレクションは見つからない扱い", async () => {
		const { event } = makeEvent({ rpc: { data: null, error: { code: "P0002", message: "collection not found" } } });
		expect((await run(POST(event))).status).toBe(404);
	});

	it("20個を超えるときは、消してから取り込むよう知らせる", async () => {
		const { event } = makeEvent({ rpc: { data: null, error: { code: "22023", message: "too many collections" } } });
		const result = await run(POST(event));
		expect(result.status).toBe(400);
		expect(result.body?.message).toContain("20個まで");
	});
});
