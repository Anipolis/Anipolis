import { describe, expect, it } from "vitest";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import { getPostDisplayContent, getPostRoomContext, isPostContinuation } from "./post-presentation";

describe("adjacent post headings", () => {
	const posts = makeTimelinePosts();
	const first = posts[0];
	const next = posts[1];
	const other = posts[2];
	if (!first || !next || !other) throw new Error("Missing timeline fixtures");
	it("groups only an adjacent author in the same room within two minutes", () => {
		expect(isPostContinuation(next, first)).toBe(true);
		expect(isPostContinuation(next, undefined)).toBe(false);
		expect(isPostContinuation(other, next)).toBe(false);
		expect(isPostContinuation({ ...next, created_at: "2026-09-08T12:03:00Z" }, first)).toBe(false);
	});
	it("keeps distinct rooms, events, and reply threads separate", () => {
		expect(isPostContinuation({ ...next, broadcast_room_session_id: "another-room" }, first)).toBe(false);
		expect(
			isPostContinuation({ ...next, event_room: { id: "event", title: "上映会", hashtag: "上映会" } }, first),
		).toBe(false);
		expect(isPostContinuation({ ...next, parent_id: "another-thread" }, first)).toBe(false);
	});
	it("requires an explicit context and supports the home timeline's descending order", () => {
		expect(isPostContinuation(first, next)).toBe(true);
		expect(
			isPostContinuation(
				{ ...next, anime_id: null, broadcast_room_session_id: null },
				{ ...first, anime_id: null, broadcast_room_session_id: null },
			),
		).toBe(false);
		expect(isPostContinuation({ ...next, created_at: "invalid" }, first)).toBe(false);
	});
});

describe("room-aware post content", () => {
	const base = makeTimelinePosts()[0];
	if (!base) throw new Error("Missing timeline fixture");
	const eventPost = {
		...base,
		content: "最高だった #上映会",
		event_room: { id: "e1", title: "上映会", hashtag: "上映会" },
	};
	it("hides the trailing room tag only when it is a separate word", () => {
		expect(getPostDisplayContent(eventPost)).toBe("最高だった");
		expect(getPostDisplayContent({ ...eventPost, content: "最高だった#上映会" })).toBe("最高だった#上映会");
		expect(getPostDisplayContent({ ...eventPost, event_room: null })).toBe("最高だった #上映会");
	});
	it("links event posts to their event room", () => {
		expect(getPostRoomContext({ ...eventPost, anime_quote: null })?.href).toBe("/events/e1");
		expect(getPostRoomContext({ ...base, anime_quote: null, event_room: null })).toBeNull();
	});
});
