import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "#lib/supabase/database.types.ts";
import { getNotificationPage, NOTIFICATION_PAGE_SIZE } from "./queries";

type Result = { data: unknown; error: { message: string } | null };

/** notifications へのクエリで呼ばれたメソッドを記録しつつ、await で result を返す */
function fakeSupabase(result: Result) {
	const calls: { method: string; args: unknown[] }[] = [];
	const chain = Promise.resolve(result) as Promise<Result> & Record<string, (...args: unknown[]) => unknown>;
	for (const method of ["select", "eq", "order", "limit", "in", "or", "lte"]) {
		chain[method] = (...args: unknown[]) => {
			calls.push({ method, args });
			return chain;
		};
	}
	const from = vi.fn((_table: string) => chain);
	const rpc = vi.fn();
	return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls, from, rpc };
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** n が大きいほど古い通知。DB の並び（created_at, id の降順）で返ってくる想定 */
function row(n: number, createdAt = new Date(Date.UTC(2026, 10, 20) - n * 60_000).toISOString()) {
	return {
		id: UUID(1000 - n),
		type: "like",
		post_id: UUID(5000 + n),
		anime_recommendation_id: null,
		broadcast_anime_id: null,
		broadcast_scheduled_at: null,
		broadcast_room_date: null,
		event_id: null,
		activity_id: null,
		exchange_anime_id: null,
		read: false,
		created_at: createdAt,
		actor: { username: `u${n}`, display_name: null, avatar_url: null },
		post: { content: `post ${n}`, image_urls: null, anime_id: null, quoted_post_id: null, exchange_share: null },
		recommendation: null,
		broadcast_anime: null,
		event: null,
		activity: null,
		exchange_anime: null,
	};
}

const rows = (count: number) => Array.from({ length: count }, (_, i) => row(i));

describe("getNotificationPage（#249）", () => {
	it("1ページは50件。（created_at, id）の降順で、続きの有無を見るために1件多く読む", async () => {
		const { client, calls, from } = fakeSupabase({ data: [], error: null });
		await getNotificationPage(client, "me", { types: ["like", "reply"] });
		expect(NOTIFICATION_PAGE_SIZE).toBe(50);
		expect(from.mock.calls.map(([table]) => table)).toEqual(["notifications"]);
		expect(calls).toContainEqual({ method: "eq", args: ["recipient_id", "me"] });
		expect(calls).toContainEqual({ method: "in", args: ["type", ["like", "reply"]] });
		expect(calls.filter((c) => c.method === "order").map((c) => c.args)).toEqual([
			["created_at", { ascending: false }],
			["id", { ascending: false }],
		]);
		expect(calls).toContainEqual({ method: "limit", args: [51] });
		// 先頭のページはカーソルで絞らない
		expect(calls.some((c) => c.method === "or" || c.method === "lte")).toBe(false);
	});

	it("0件なら空で、続きは無い", async () => {
		const { client } = fakeSupabase({ data: [], error: null });
		expect(await getNotificationPage(client, "me")).toEqual({ notifications: [], nextCursor: null });
	});

	it("ちょうど50件なら全部出し、空の続きのページは作らない", async () => {
		const { client } = fakeSupabase({ data: rows(50), error: null });
		const page = await getNotificationPage(client, "me");
		expect(page.notifications).toHaveLength(50);
		expect(page.nextCursor).toBeNull();
	});

	it("51件以上なら50件だけ出し、50件目を続きの目印にする", async () => {
		const data = rows(51);
		const { client } = fakeSupabase({ data, error: null });
		const page = await getNotificationPage(client, "me");
		expect(page.notifications).toHaveLength(50);
		expect(page.notifications.map((n) => n.id)).not.toContain(data[50]?.id);
		expect(page.nextCursor).toEqual({ createdAt: data[49]?.created_at, id: data[49]?.id });
	});

	it("カーソルがあれば、その行より前だけを読む。同じ時刻の行は id で区切る", async () => {
		const sameTime = "2026-11-20T00:00:00.123456+00:00";
		const { client, calls } = fakeSupabase({ data: [], error: null });
		await getNotificationPage(client, "me", { cursor: { createdAt: sameTime, id: UUID(7) } });
		expect(calls).toContainEqual({ method: "lte", args: ["created_at", sameTime] });
		expect(calls).toContainEqual({
			method: "or",
			args: [`created_at.lt.${sameTime},and(created_at.eq.${sameTime},id.lt.${UUID(7)})`],
		});
	});

	it("同じ時刻の行がページの境目をまたいでも、目印は時刻と id の組なので続きで重複も欠落もしない", async () => {
		const sameTime = "2026-11-20T00:00:00+00:00";
		// 3件とも同じ時刻。limit 2 なら2件目（id の大きい順で2番目）が目印になる
		const data = [row(1, sameTime), row(2, sameTime), row(3, sameTime)];
		const { client } = fakeSupabase({ data, error: null });
		const page = await getNotificationPage(client, "me", { limit: 2 });
		expect(page.notifications.map((n) => n.id)).toEqual([data[0]?.id, data[1]?.id]);
		expect(page.nextCursor).toEqual({ createdAt: sameTime, id: data[1]?.id });

		const next = fakeSupabase({ data: [data[2]], error: null });
		const nextPage = await getNotificationPage(next.client, "me", {
			limit: 2,
			cursor: page.nextCursor ?? undefined,
		});
		expect(nextPage.notifications.map((n) => n.id)).toEqual([data[2]?.id]);
		expect(nextPage.nextCursor).toBeNull();
		expect(next.calls).toContainEqual({
			method: "or",
			args: [`created_at.lt.${sameTime},and(created_at.eq.${sameTime},id.lt.${data[1]?.id})`],
		});
	});

	it("読めない投稿（削除・非表示）への通知も捨てずに数えるので、ページの件数はぶれない", async () => {
		const data = rows(51).map((r, i) => (i % 3 === 0 ? { ...r, post: null } : r));
		const { client } = fakeSupabase({ data, error: null });
		const page = await getNotificationPage(client, "me");
		expect(page.notifications).toHaveLength(50);
		expect(page.notifications.filter((n) => !n.post_available).length).toBeGreaterThan(0);
		expect(page.nextCursor).toEqual({ createdAt: data[49]?.created_at, id: data[49]?.id });
	});

	it("取得に失敗したら投げる（空の一覧と見せない）", async () => {
		const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(getNotificationPage(client, "me")).rejects.toThrow();
		log.mockRestore();
	});
});
