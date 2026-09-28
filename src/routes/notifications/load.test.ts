import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/actions", () => ({ markCategoryNotificationsRead: vi.fn() }));
vi.mock("$lib/server/queries", () => ({
	getNotifications: vi.fn(async () => [{ id: "n1" }]),
	getUnreadNotificationCountsByCategory: vi.fn(async () => ({ normal: 2, room: 1, mylist: 0 })),
	getAnimeRankingTrending: vi.fn(async () => []),
}));

import { markCategoryNotificationsRead } from "$lib/server/actions";
import { getNotifications } from "$lib/server/queries";
import { load } from "./+page.server";

// load の戻り値型には Record の索引シグネチャが混ざるため、検証したい形に絞って扱う
type LoadResult = {
	tab: string;
	unreadCounts: { normal: number; room: number; mylist: number };
	notifications: { normal: unknown[]; room: unknown[]; mylist: unknown[] };
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
		const result = (await load(makeEvent("room"))) as unknown as LoadResult;

		expect(markCategoryNotificationsRead).not.toHaveBeenCalled();
		expect(result.tab).toBe("room");
		expect(result.unreadCounts).toEqual({ normal: 2, room: 1, mylist: 0 });
		expect(getNotifications).toHaveBeenCalledWith(expect.anything(), "u1", 50, ["broadcast"]);
		expect(result.notifications.room).toEqual([{ id: "n1" }]);
	});

	it("falls back to the normal tab for unknown values", async () => {
		const result = (await load(makeEvent("everything"))) as unknown as LoadResult;
		expect(result.tab).toBe("normal");
		expect(markCategoryNotificationsRead).not.toHaveBeenCalled();
	});

	it("redirects anonymous users", async () => {
		await expect(load(makeEvent(null, null))).rejects.toMatchObject({ status: 302, location: "/" });
	});
});
