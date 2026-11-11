import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ markCategoryNotificationsRead: vi.fn() }));
vi.mock("$lib/server/queries", () => ({
	getNotifications: vi.fn(async () => [{ id: "n1" }]),
	getUnreadNotificationCount: vi.fn(async () => 2),
	getAnimeRankingTrending: vi.fn(async () => []),
}));

import { markCategoryNotificationsRead } from "$lib/server/actions";
import { getNotifications } from "$lib/server/queries";
import { load } from "./+page.server";

// load の戻り値型には Record の索引シグネチャが混ざるため、検証したい形に絞って扱う
type LoadResult = {
	unreadCount: number;
	notifications: unknown[];
};

function makeEvent(tab: string | null, user: { id: string } | null = { id: "u1" }) {
	const url = new URL(`http://localhost/notifications${tab ? `?tab=${tab}` : ""}`);
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
		const types = vi.mocked(getNotifications).mock.lastCall?.[3] ?? [];
		expect(types).toEqual(expect.arrayContaining(["like", "activity_like", "exchange_matched"]));
		expect(types).not.toContain("broadcast");
		expect(types).not.toContain("mylist_status");
	});

	it("なくしたタブの URL（?tab=room など）で開いても同じ一覧を出す", async () => {
		const result = (await load(makeEvent("room"))) as unknown as LoadResult;
		expect(result.notifications).toEqual([{ id: "n1" }]);
		expect(vi.mocked(getNotifications).mock.lastCall?.[3]).not.toContain("broadcast");
	});

	it("未ログインならログイン画面へ送り、ログイン後に通知へ戻す", async () => {
		await expect(load(makeEvent(null, null))).rejects.toMatchObject({
			status: 303,
			location: "/auth?next=%2Fnotifications",
		});
	});
});
