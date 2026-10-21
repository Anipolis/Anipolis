import { describe, expect, it } from "vitest";
import {
	applyPostStates,
	comparePostsAsc,
	cursorOfLast,
	fetchRoomPostPages,
	mergeReplies,
	mergeRoomPosts,
	type RoomPostCursor,
	type RoomPostPage,
} from "./room-live-sync";
import type { Post } from "./types";

function post(id: string, createdAt: string, extra: Partial<Post> = {}): Post {
	return { id, created_at: createdAt, reply_count: 0, content: id, ...extra } as Post;
}

/** DB と同じく created_at → id の昇順に並んだ投稿を、cursor より後ろから pageSize 件ずつ返す偽の差分 API */
function fakeDiffApi(all: Post[], pageSize: number, failOnCall?: number) {
	const sorted = [...all].sort(comparePostsAsc);
	let calls = 0;
	const fetchPage = async (cursor: RoomPostCursor | null): Promise<RoomPostPage | null> => {
		calls++;
		if (calls === failOnCall) return null;
		const after = cursor
			? sorted.filter((p) => comparePostsAsc(p, { id: cursor.id, created_at: cursor.createdAt }) > 0)
			: sorted;
		const page = after.slice(0, pageSize);
		return { posts: page, nextCursor: cursorOfLast(page) ?? cursor, hasMore: page.length === pageSize };
	};
	return { fetchPage, calls: () => calls };
}

const T = (second: number) => `2026-10-13T12:00:${String(second).padStart(2, "0")}.000Z`;

describe("fetchRoomPostPages（#320）", () => {
	it("未受信が1ページ（100件）を超えても、古い側から続きを追って全件取る", async () => {
		const unseen = Array.from({ length: 150 }, (_, i) => post(`p-${String(i).padStart(3, "0")}`, T(i % 60)));
		const api = fakeDiffApi(unseen, 100);

		const result = await fetchRoomPostPages(api.fetchPage, null, 10);

		expect(result.ok).toBe(true);
		expect(result.hasMore).toBe(false);
		expect(result.posts).toHaveLength(150);
		expect(new Set(result.posts.map((p) => p.id)).size).toBe(150);
		expect(api.calls()).toBe(2);
	});

	it("最後に受け取った投稿と同じ時刻の別の投稿も落とさない", async () => {
		const received = post("a-1", T(5));
		const sameTime = post("b-2", T(5));
		const later = post("c-3", T(6));
		const api = fakeDiffApi([received, sameTime, later], 100);

		const result = await fetchRoomPostPages(api.fetchPage, cursorOfLast([received]), 10);

		expect(result.posts.map((p) => p.id)).toEqual(["b-2", "c-3"]);
	});

	it("途中で失敗したら、そこまでの分と境界を返し、次回その続きから取れる", async () => {
		const unseen = Array.from({ length: 250 }, (_, i) => post(`p-${String(i).padStart(3, "0")}`, T(0)));
		const first = await fetchRoomPostPages(fakeDiffApi(unseen, 100, 2).fetchPage, null, 10);
		expect(first.ok).toBe(false);
		expect(first.posts).toHaveLength(100);

		const second = await fetchRoomPostPages(fakeDiffApi(unseen, 100).fetchPage, first.cursor, 10);
		expect(second.posts).toHaveLength(150);
		expect(new Set([...first.posts, ...second.posts].map((p) => p.id)).size).toBe(250);
	});

	it("ページ数の上限に達したら、続きがあることを返す", async () => {
		const unseen = Array.from({ length: 300 }, (_, i) => post(`p-${String(i).padStart(3, "0")}`, T(0)));
		const result = await fetchRoomPostPages(fakeDiffApi(unseen, 100).fetchPage, null, 2);
		expect(result.posts).toHaveLength(200);
		expect(result.hasMore).toBe(true);
	});
});

describe("mergeRoomPosts / applyPostStates（#324 #347）", () => {
	const base = [post("a", T(1)), post("b", T(2), { reply_count: 0 })];
	const extra = [post("c", T(3)), post("b", T(2))];

	it("ID で重複を除き、古い順（同じ時刻は id 順）に並べる", () => {
		expect(mergeRoomPosts(base, [post("a2", T(1)), ...extra]).map((p) => p.id)).toEqual(["a", "a2", "b", "c"]);
	});

	it("見えなくなった投稿を除き、返信数の更新を反映する", () => {
		const merged = mergeRoomPosts(base, extra, new Set(["c"]), new Map([["b", 4]]));
		expect(merged.map((p) => p.id)).toEqual(["a", "b"]);
		expect(merged.find((p) => p.id === "b")?.reply_count).toBe(4);
	});

	it("確かめた投稿のうち結果に無いものを非表示にし、返信数の変化だけを記録する", () => {
		const first = applyPostStates(["a", "b", "c"], { a: 0, b: 2 }, new Set(), new Map());
		expect(first.changed).toBe(true);
		expect([...first.hidden]).toEqual(["c"]);
		expect(first.replyCounts.get("b")).toBe(2);

		const again = applyPostStates(["a", "b", "c"], { a: 0, b: 2 }, first.hidden, first.replyCounts);
		expect(again.changed).toBe(false);
	});
});

describe("mergeReplies（#325）", () => {
	it("最新の返信を保ったまま、古い側の続きを ID でまとめて古い順に並べる", () => {
		const recent = [post("r-198", T(58)), post("r-199", T(59))];
		const older = [post("r-000", T(0)), post("r-198", T(58))];
		expect(mergeReplies(recent, older).map((p) => p.id)).toEqual(["r-000", "r-198", "r-199"]);
	});
});
