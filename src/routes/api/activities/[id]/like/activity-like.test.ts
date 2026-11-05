import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ requireAccountCanWrite: vi.fn() }));

import { DELETE, POST } from "./+server";

const USER = "11111111-1111-4111-8111-111111111111";
const ACTIVITY = "22222222-2222-4222-8222-222222222222";

type Options = {
	user?: { id: string } | null;
	id?: string;
	insertError?: { code: string } | null;
	count?: number;
};

function makeEvent(options: Options = {}) {
	const calls: { op: string; args: unknown[] }[] = [];
	// await できる（Promise そのもの）うえに .eq() をつなげられる問い合わせ
	const chain = (result: unknown) => {
		const query: Promise<unknown> & { eq: (...args: unknown[]) => typeof query } = Object.assign(
			Promise.resolve(result),
			{
				eq: (...args: unknown[]) => {
					calls.push({ op: "eq", args });
					return query;
				},
			},
		);
		return query;
	};
	const supabase = {
		from: () => ({
			insert: async (row: unknown) => {
				calls.push({ op: "insert", args: [row] });
				return { error: options.insertError ?? null };
			},
			delete: () => {
				calls.push({ op: "delete", args: [] });
				return chain({ error: null });
			},
			select: () => chain({ count: options.count ?? 1, error: null }),
		}),
	};
	const event = {
		params: { id: options.id ?? ACTIVITY },
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

describe("アクティビティのいいね", () => {
	it("付けると、自分のいいねを足して保存後の数を返す", async () => {
		const { event, calls } = makeEvent({ count: 3 });
		const response = await POST(event);
		expect(await response.json()).toEqual({ liked: true, likeCount: 3 });
		expect(calls[0]).toEqual({ op: "insert", args: [{ activity_id: ACTIVITY, user_id: USER }] });
	});

	it("もう付いていれば、付いている状態を返す", async () => {
		const { event } = makeEvent({ insertError: { code: "23505" } });
		expect(await (await POST(event)).json()).toMatchObject({ liked: true });
	});

	it("見えない記録（RLS で断られた）には 404", async () => {
		const { event } = makeEvent({ insertError: { code: "42501" } });
		expect(await statusOf(POST(event))).toBe(404);
	});

	it("外すと、自分のいいねだけを消す", async () => {
		const { event, calls } = makeEvent({ count: 0 });
		expect(await (await DELETE(event)).json()).toEqual({ liked: false, likeCount: 0 });
		expect(calls.slice(0, 3)).toEqual([
			{ op: "delete", args: [] },
			{ op: "eq", args: ["activity_id", ACTIVITY] },
			{ op: "eq", args: ["user_id", USER] },
		]);
	});

	it.each([
		["ID の形でない", { id: "nope" }, 404],
		["ログインしていない", { user: null }, 401],
	] as const)("%s", async (_label, options, status) => {
		const { event, calls } = makeEvent(options);
		expect(await statusOf(POST(event))).toBe(status);
		expect(calls).toEqual([]);
	});
});
