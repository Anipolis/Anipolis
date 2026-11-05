import { describe, expect, it } from "vitest";
import { groupActivities, type MylistActivity } from "./activity";

function activity(id: string, user: string, status: MylistActivity["status"], minutesAgo: number): MylistActivity {
	return {
		id,
		created_at: new Date(Date.UTC(2026, 10, 2, 12, 0) - minutesAgo * 60_000).toISOString(),
		status,
		score: null,
		user: { id: user, username: user, display_name: null, avatar_url: null },
		anime: { id: id, title: id, cover_url: null },
		like_count: 0,
		liked: false,
	};
}

describe("groupActivities", () => {
	it("同じ人・同じステータスで30分以内に続いた分を、一番新しい位置にまとめる", () => {
		const groups = groupActivities([
			activity("a1", "alice", "plan_to_watch", 0),
			activity("b1", "bob", "completed", 5),
			activity("a2", "alice", "plan_to_watch", 20),
			activity("a3", "alice", "plan_to_watch", 45),
		]);
		expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([["a1", "a2", "a3"], ["b1"]]);
	});

	it("間が30分より空いたら、別のまとまりにする", () => {
		const groups = groupActivities([
			activity("a1", "alice", "watching", 0),
			activity("a2", "alice", "watching", 31),
		]);
		expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([["a1"], ["a2"]]);
	});

	it("ステータスが違えばまとめない", () => {
		const groups = groupActivities([
			activity("a1", "alice", "watching", 0),
			activity("a2", "alice", "completed", 1),
		]);
		expect(groups).toHaveLength(2);
	});
});
