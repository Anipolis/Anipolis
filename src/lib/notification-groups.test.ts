import { describe, expect, it } from "vitest";
import { groupActivityLikes } from "./notification-groups";
import type { Notification } from "./types";

function notif(id: string, type: Notification["type"], activityId: string | null = null): Notification {
	return { id, type, activity_id: activityId } as Notification;
}

describe("groupActivityLikes", () => {
	it("同じ記録へのいいねは一番新しい1件にまとめ、ほかの通知はそのまま並べる", () => {
		const entries = groupActivityLikes([
			notif("1", "activity_like", "a"),
			notif("2", "like"),
			notif("3", "activity_like", "b"),
			notif("4", "activity_like", "a"),
			notif("5", "activity_like", "a"),
		]);
		expect(entries.map((entry) => [entry.notif.id, entry.others.map((other) => other.id)])).toEqual([
			["1", ["4", "5"]],
			["2", []],
			["3", []],
		]);
	});
});
