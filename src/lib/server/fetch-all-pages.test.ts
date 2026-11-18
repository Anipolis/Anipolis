import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import { FETCH_ALL_PAGE_SIZE, fetchAllPages, getBlockedUserIds, getMutedProfiles, getMutedUserIds } from "./queries";

/** range(from, to) で切り出して返す、取得上限（max_rows）付きの模造 */
function pagedBuilder<T>(rows: T[], ranges: [number, number][], failAt?: number) {
	const builder: Record<string, unknown> = {};
	for (const method of ["select", "eq", "order"]) builder[method] = () => builder;
	builder["range"] = (from: number, to: number) => {
		ranges.push([from, to]);
		if (failAt === from) return Promise.resolve({ data: null, error: { message: "boom" } });
		const end = Math.min(to + 1, from + FETCH_ALL_PAGE_SIZE);
		return Promise.resolve({ data: rows.slice(from, end), error: null });
	};
	return builder;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i).padStart(5, "0")}`);

describe("fetchAllPages（#558）", () => {
	it("取得上限を超えても、最後のページまで続けて読む", async () => {
		const ranges: [number, number][] = [];
		const all = ids(2500);
		const { rows, error } = await fetchAllPages<string>((from, to) =>
			Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + FETCH_ALL_PAGE_SIZE)), error: null }).then(
				(r) => {
					ranges.push([from, to]);
					return r;
				},
			),
		);
		expect(error).toBeNull();
		expect(rows).toHaveLength(2500);
		expect(ranges).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
		]);
	});

	it("ちょうど上限の件数なら、空のページを確かめて終わる", async () => {
		const ranges: [number, number][] = [];
		const all = ids(FETCH_ALL_PAGE_SIZE);
		const { rows } = await fetchAllPages<string>((from, to) => {
			ranges.push([from, to]);
			return Promise.resolve({ data: all.slice(from, to + 1), error: null });
		});
		expect(rows).toHaveLength(FETCH_ALL_PAGE_SIZE);
		expect(ranges).toHaveLength(2);
	});

	it("途中で失敗したら error を返す", async () => {
		const ranges: [number, number][] = [];
		const builder = pagedBuilder(ids(1500), ranges, 1000);
		const result = await fetchAllPages((from, to) =>
			(builder["range"] as (a: number, b: number) => never)(from, to),
		);
		expect(result.error).toEqual({ message: "boom" });
		expect(result.rows).toHaveLength(1000);
	});
});

describe("ミュート・ブロックの ID を全件読む（#558）", () => {
	it("ミュートした相手が1000人を超えても全員分を読む", async () => {
		const ranges: [number, number][] = [];
		const rows = ids(1234).map((muted_id) => ({ muted_id }));
		const client = { from: vi.fn(() => pagedBuilder(rows, ranges)) } as unknown as SupabaseClient<Database>;
		const muted = await getMutedUserIds(client, "me");
		expect(muted.size).toBe(1234);
		expect(muted.has("u01233")).toBe(true);
	});

	it("ブロック（両方向）が1000人を超えても全員分を読む", async () => {
		const ranges: [number, number][] = [];
		const rows = ids(2001).map((user_id) => ({ user_id }));
		const client = { rpc: vi.fn(() => pagedBuilder(rows, ranges)) } as unknown as SupabaseClient<Database>;
		const blocked = await getBlockedUserIds(client, "me");
		expect(blocked.size).toBe(2001);
		expect(ranges).toHaveLength(3);
	});

	it("設定画面のミュート一覧も1000人を超えて出す（1000人目以降も解除できる）", async () => {
		const ranges: [number, number][] = [];
		const rows = ids(1001).map((id) => ({
			created_at: "2026-11-18T00:00:00Z",
			muted: { id, username: id, display_name: null, avatar_url: null, bio: null },
		}));
		const client = { from: vi.fn(() => pagedBuilder(rows, ranges)) } as unknown as SupabaseClient<Database>;
		const profiles = await getMutedProfiles(client, "me");
		expect(profiles).toHaveLength(1001);
	});
});
