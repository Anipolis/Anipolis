import type { Post } from "$lib/types";

/** 取得済みの境界。created_at だけだと同じ時刻の投稿を落とすので id も持つ（#320） */
export type RoomPostCursor = { createdAt: string; id: string };

type Sortable = Pick<Post, "id" | "created_at">;

/** 古い順（created_at → id）。DB の並び（created_at, id 昇順）と同じ順にする */
export function comparePostsAsc(a: Sortable, b: Sortable): number {
	const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
	if (delta !== 0) return delta;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function cursorOfLast(posts: readonly Sortable[]): RoomPostCursor | null {
	const last = posts[posts.length - 1];
	return last ? { createdAt: last.created_at, id: last.id } : null;
}

/**
 * load 由来の投稿（base）とライブ更新で受け取った投稿（extra）を ID でまとめ、古い順に並べる。
 * 再確認で見えなくなった投稿（hidden）は除き、返信数の更新（replyCounts）を反映する（#324）。
 */
export function mergeRoomPosts(
	base: readonly Post[],
	extra: readonly Post[],
	hidden: ReadonlySet<string> = new Set(),
	replyCounts: ReadonlyMap<string, number> = new Map(),
): Post[] {
	const seen = new Set(base.map((post) => post.id));
	const fresh = extra.filter((post) => !seen.has(post.id));
	const merged = fresh.length === 0 ? [...base] : [...base, ...fresh].sort(comparePostsAsc);
	if (hidden.size === 0 && replyCounts.size === 0) return merged;
	return merged
		.filter((post) => !hidden.has(post.id))
		.map((post) => {
			const count = replyCounts.get(post.id);
			return count === undefined || count === post.reply_count ? post : { ...post, reply_count: count };
		});
}

export type RoomPostPage = { posts: Post[]; nextCursor: RoomPostCursor | null; hasMore: boolean };

/**
 * 境界から古い順にページを追い、続きが無くなるか maxPages に達するまで取る（#320）。
 * 途中で失敗したら、そこまでに取れた分と、その時点の境界を返す（次回はその続きから取る）。
 */
export async function fetchRoomPostPages(
	fetchPage: (cursor: RoomPostCursor | null) => Promise<RoomPostPage | null>,
	cursor: RoomPostCursor | null,
	maxPages: number,
): Promise<{ posts: Post[]; cursor: RoomPostCursor | null; ok: boolean; hasMore: boolean }> {
	const posts: Post[] = [];
	let current = cursor;
	for (let page = 0; page < maxPages; page++) {
		const result = await fetchPage(current);
		if (!result) return { posts, cursor: current, ok: false, hasMore: true };
		posts.push(...result.posts);
		current = result.nextCursor ?? current;
		if (!result.hasMore) return { posts, cursor: current, ok: true, hasMore: false };
	}
	return { posts, cursor: current, ok: true, hasMore: true };
}

/**
 * 再確認の結果を反映する（#324）。visible は「今も閲覧できる投稿 → 返信数」。
 * 確かめた ID のうち visible に無いものは、削除・管理者非表示・ブロックで見えなくなった投稿。
 */
export function applyPostStates(
	checkedIds: readonly string[],
	visible: Readonly<Record<string, number>>,
	hidden: ReadonlySet<string>,
	replyCounts: ReadonlyMap<string, number>,
): { hidden: Set<string>; replyCounts: Map<string, number>; changed: boolean } {
	const nextHidden = new Set(hidden);
	const nextCounts = new Map(replyCounts);
	let changed = false;
	for (const id of checkedIds) {
		const count = visible[id];
		if (count === undefined) {
			if (!nextHidden.has(id)) {
				nextHidden.add(id);
				changed = true;
			}
		} else if (nextCounts.get(id) !== count) {
			nextCounts.set(id, count);
			changed = true;
		}
	}
	return { hidden: nextHidden, replyCounts: nextCounts, changed };
}

/** 取得済みの返信と新しく取った返信を ID でまとめ、古い順に並べる（#325） */
export function mergeReplies(current: readonly Post[], incoming: readonly Post[]): Post[] {
	const byId = new Map(current.map((reply) => [reply.id, reply]));
	for (const reply of incoming) byId.set(reply.id, reply);
	return [...byId.values()].sort(comparePostsAsc);
}
