import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/server/actions.ts", () => ({ markCategoryNotificationsRead: vi.fn() }));
vi.mock("#lib/server/queries.ts", () => ({
	getNotificationPage: vi.fn(async () => ({
		notifications: [{ id: "n1" }],
		nextCursor: { createdAt: "2026-11-20T00:00:00+00:00", id: "00000000-0000-4000-8000-000000000001" },
	})),
	getUnreadNotificationCount: vi.fn(async () => 2),
	getAnimeRankingTrending: vi.fn(async () => []),
}));

import { markCategoryNotificationsRead } from "#lib/server/actions.ts";
import { getNotificationPage } from "#lib/server/queries.ts";
import { load } from "./+page.server";

// load の戻り値型には Record の索引シグネチャが混ざるため、検証したい形に絞って扱う
type LoadResult = {
	unreadCount: number;
	notifications: unknown[];
	nextCursor: unknown;
	isContinuation: boolean;
};

const CURSOR_AT = "2026-11-19T12:34:56.123456+00:00";
const CURSOR_ID = "00000000-0000-4000-8000-0000000000aa";

function makeEvent(tab: string | null, user: { id: string } | null = { id: "u1" }, query = "") {
	const params = new URLSearchParams(query);
	if (tab) params.set("tab", tab);
	const search = params.toString();
	const url = new URL(`http://localhost/notifications${search ? `?${search}` : ""}`);
	return {
		url,
		parent: async () => ({}),
		locals: {
			supabase: { rpc: vi.fn(async () => ({ data: [] })) },
			safeGetSession: async () => ({ user, session: null }),
		},
	} as unknown as Parameters<typeof load>[0];
}

describe("notifications page load", () => {
	it("never marks notifications read, so hover preload and prefetch cannot change state", async () => {
		const result = (await load(makeEvent(null))) as unknown as LoadResult;

		expect(markCategoryNotificationsRead).not.toHaveBeenCalled();
		expect(result.unreadCount).toBe(2);
		expect(result.notifications).toEqual([{ id: "n1" }]);
	});

	it("放送前のお知らせはカレンダーに出すので、通知には読まない", async () => {
		await load(makeEvent(null));
		const types = vi.mocked(getNotificationPage).mock.lastCall?.[2]?.types ?? [];
		expect(types).toEqual(expect.arrayContaining(["like", "activity_like", "exchange_matched"]));
		expect(types).not.toContain("broadcast");
		expect(types).not.toContain("mylist_status");
	});

	it("なくしたタブの URL（?tab=room など）で開いても同じ一覧を出す", async () => {
		const result = (await load(makeEvent("room"))) as unknown as LoadResult;
		expect(result.notifications).toEqual([{ id: "n1" }]);
		expect(vi.mocked(getNotificationPage).mock.lastCall?.[2]?.types).not.toContain("broadcast");
	});

	it("先頭のページはカーソルなしで読み、続きの目印をそのまま返す（#249）", async () => {
		const result = (await load(makeEvent(null))) as unknown as LoadResult;
		expect(vi.mocked(getNotificationPage).mock.lastCall?.[2]?.cursor).toBeUndefined();
		expect(result.isContinuation).toBe(false);
		expect(result.nextCursor).toEqual({
			createdAt: "2026-11-20T00:00:00+00:00",
			id: "00000000-0000-4000-8000-000000000001",
		});
	});

	it("?before=…&before_id=… があれば、その目印より前を読む", async () => {
		const query = new URLSearchParams({ before: CURSOR_AT, before_id: CURSOR_ID }).toString();
		const result = (await load(makeEvent(null, { id: "u1" }, query))) as unknown as LoadResult;
		expect(vi.mocked(getNotificationPage).mock.lastCall?.[1]).toBe("u1");
		expect(vi.mocked(getNotificationPage).mock.lastCall?.[2]?.cursor).toEqual({
			createdAt: CURSOR_AT,
			id: CURSOR_ID,
		});
		expect(result.isContinuation).toBe(true);
	});

	it("形の違う目印は捨てて先頭のページを出す（フィルタに埋め込まない）", async () => {
		const query = new URLSearchParams({ before: "2026-11-19),id.gt.(x", before_id: CURSOR_ID }).toString();
		const result = (await load(makeEvent(null, { id: "u1" }, query))) as unknown as LoadResult;
		expect(vi.mocked(getNotificationPage).mock.lastCall?.[2]?.cursor).toBeUndefined();
		expect(result.isContinuation).toBe(false);
	});

	it("タブを切り替えても（?tab=room など）、目印は同じ種類の一覧の中でだけ使い、目印が無ければ先頭から読む", async () => {
		const query = new URLSearchParams({ before: CURSOR_AT, before_id: CURSOR_ID }).toString();
		await load(makeEvent("room", { id: "u1" }, query));
		const withCursor = vi.mocked(getNotificationPage).mock.lastCall?.[2];
		await load(makeEvent("normal"));
		const switched = vi.mocked(getNotificationPage).mock.lastCall?.[2];
		expect(withCursor?.cursor).toEqual({ createdAt: CURSOR_AT, id: CURSOR_ID });
		expect(switched?.cursor).toBeUndefined();
		expect(withCursor?.types).toEqual(switched?.types);
	});

	it("未ログインならログイン画面へ送り、ログイン後に通知へ戻す", async () => {
		await expect(load(makeEvent(null, null))).rejects.toMatchObject({
			status: 303,
			location: "/auth?next=%2Fnotifications",
		});
	});
});
