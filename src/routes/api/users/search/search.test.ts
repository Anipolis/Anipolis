import { describe, expect, it, vi } from "vitest";
import { GET } from "./+server";

function makeEvent(q: string | null, blockedUserIds: string[] = []) {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain: Record<string, unknown> = {};
	for (const method of ["select", "ilike", "order", "not"]) {
		chain[method] = vi.fn((...args: unknown[]) => {
			calls.push({ method, args });
			return chain;
		});
	}
	chain["limit"] = vi.fn(async (...args: unknown[]) => {
		calls.push({ method: "limit", args });
		return { data: [{ id: "u1", username: "mikan_cat", display_name: null, avatar_url: null }], error: null };
	});
	const url = new URL("http://localhost/api/users/search");
	if (q !== null) url.searchParams.set("q", q);
	const event = {
		url,
		locals: {
			supabase: {
				from: vi.fn(() => chain),
				// ブロック相手の除外用（141 の get_blocked_user_ids）
				rpc: vi.fn(async () => ({ data: blockedUserIds.map((id) => ({ user_id: id })), error: null })),
			},
			safeGetSession: vi.fn(async () => ({ user: { id: "me" }, session: null })),
		},
	} as unknown as Parameters<typeof GET>[0];
	return { event, calls };
}

describe("GET /api/users/search", () => {
	it("finds accounts when the query is typed with a leading @", async () => {
		const { event, calls } = makeEvent("@mikan");
		const response = await GET(event);
		expect(await response.json()).toHaveLength(1);
		expect(calls.find((c) => c.method === "ilike")?.args).toEqual(["username", "%mikan%"]);
	});

	it("returns nothing for a bare @ without querying", async () => {
		const { event, calls } = makeEvent("@");
		expect(await (await GET(event)).json()).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("escapes LIKE wildcards and caps the query length", async () => {
		const { event, calls } = makeEvent(`_${"a".repeat(80)}%`);
		await GET(event);
		const pattern = calls.find((c) => c.method === "ilike")?.args[1] as string;
		// エスケープ済みの先頭: %\_a
		expect(pattern.slice(0, 4)).toBe(String.raw`%\_a`);
		expect(pattern).not.toContain("a%%");
		expect(pattern.length).toBeLessThanOrEqual(50 + 4);
	});

	it("ブロック関係のあるユーザーを候補から外す", async () => {
		const { event, calls } = makeEvent("@mikan", ["blocked-1", "blocked-2"]);
		await GET(event);
		expect(calls.find((c) => c.method === "not")?.args).toEqual(["id", "in", "(blocked-1,blocked-2)"]);
	});

	it("ブロックが無ければ除外条件を付けない", async () => {
		const { event, calls } = makeEvent("@mikan");
		await GET(event);
		expect(calls.find((c) => c.method === "not")).toBeUndefined();
	});
});
