import { describe, expect, it } from "vitest";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import type { Post } from "$lib/types";
import { groupLiveRuns } from "./live-runs";

const base = makeTimelinePosts(1)[0] as Post;
function post(id: string, user: string, overrides: Partial<Post> = {}): Post {
	return { ...base, id, user_id: user, broadcast_room_session_id: "room-a", episode_room_id: null, ...overrides };
}
const shape = (items: ReturnType<typeof groupLiveRuns>) =>
	items.map((item) => (item.kind === "run" ? item.posts.map((p) => p.id) : item.post.id));

describe("groupLiveRuns", () => {
	it("同じ人の同じルームへの実況が 3 件以上続いたらまとめる", () => {
		const posts = [post("1", "a"), post("2", "a"), post("3", "a"), post("4", "b")];
		expect(shape(groupLiveRuns(posts))).toEqual([["1", "2", "3"], "4"]);
	});

	it("2 件まではまとめない", () => {
		const posts = [post("1", "a"), post("2", "a"), post("3", "b")];
		expect(shape(groupLiveRuns(posts))).toEqual(["1", "2", "3"]);
	});

	it("間に別の人の投稿が挟まると切れる（並び順は変えない）", () => {
		const posts = [post("1", "a"), post("2", "a"), post("3", "b"), post("4", "a"), post("5", "a")];
		expect(shape(groupLiveRuns(posts))).toEqual(["1", "2", "3", "4", "5"]);
	});

	it("別のルーム・返信・リポスト・ルーム外の投稿はまとまりを切る", () => {
		const runOf = (fourth: Post) =>
			shape(groupLiveRuns([post("1", "a"), post("2", "a"), post("3", "a"), fourth, post("5", "a")]));
		expect(runOf(post("4", "a", { broadcast_room_session_id: "room-b" }))).toEqual([["1", "2", "3"], "4", "5"]);
		expect(runOf(post("4", "a", { parent_id: "x" }))).toEqual([["1", "2", "3"], "4", "5"]);
		expect(
			runOf(
				post("4", "a", {
					repost_context: { user_id: "c", username: "c", display_name: null },
				} as Partial<Post>),
			),
		).toEqual([["1", "2", "3"], "4", "5"]);
		expect(runOf(post("4", "a", { broadcast_room_session_id: null }))).toEqual([["1", "2", "3"], "4", "5"]);
	});

	it("話数ルームはルームごと、イベントはイベントごとにまとめる", () => {
		const episode = (id: string) => post(id, "a", { episode_room_id: "ep-1", broadcast_room_session_id: id });
		expect(shape(groupLiveRuns([episode("1"), episode("2"), episode("3")]))).toEqual([["1", "2", "3"]]);
		const event = (id: string) =>
			post(id, "a", {
				broadcast_room_session_id: null,
				event_room: { id: "ev", title: "上映会", hashtag: "上映会" },
			});
		const items = groupLiveRuns([event("1"), event("2"), event("3")]);
		expect(shape(items)).toEqual([["1", "2", "3"]]);
		expect(items[0]?.kind === "run" && items[0].room?.href).toBe("/events/ev");
	});
});
