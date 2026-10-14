import { describe, expect, it } from "vitest";
import { makeTimelinePosts } from "$lib/components/fixtures/timeline";
import { buildAnimeRoomLabel, type RawPost, toPost } from "$lib/types";
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

describe("話数ルームの投稿（153）", () => {
	it("タイムラインのルーム表示は「作品名 第N話」で、話数ルームへリンクする", () => {
		const room = {
			id: "1",
			title: "天は赤い河のほとり",
			cover_url: null,
			official_hashtag: ["アニメ天河"],
			room_href: "/rooms/anime/1/ep/15",
			episode_number: 15,
			episode_room: true,
			user_score: null,
		};
		expect(buildAnimeRoomLabel(room)).toBe("天は赤い河のほとり 第15話");
		// 放送日のルーム（旧）は今どおりハッシュタグと話数
		expect(buildAnimeRoomLabel({ ...room, episode_room: false })).toBe("#アニメ天河　15話");
	});

	it("話数ルームの投稿は、放送時間外（放送枠なし）でもルームの話数とリンクを使い、ルームのタグを本文から外す", () => {
		const raw: RawPost = {
			id: "p1",
			user_id: "u1",
			content: "よかった #アニメ天河",
			created_at: "2026-10-14T00:00:00Z",
			anime_id: 1129,
			broadcast_room_session_id: null,
			episode_room_id: "room-15",
			episode_room: { kind: "episode", episode_number: 15, special_key: null, label: null },
			anime: { id: 1129, title: "天は赤い河のほとり", cover_url: null, official_hashtag: ["アニメ天河"] },
			profiles: { username: "u", display_name: null, avatar_url: null },
			post_hashtags: [],
		};
		const post = toPost(raw);
		expect(post.anime_quote?.room_href).toBe("/rooms/anime/1129/ep/15");
		expect(getPostRoomContext(post)).toEqual({
			href: "/rooms/anime/1129/ep/15",
			title: "天は赤い河のほとり 第15話",
		});
		expect(getPostDisplayContent(post)).toBe("よかった");
	});
});
