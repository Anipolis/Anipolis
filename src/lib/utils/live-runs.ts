import type { Post } from "$lib/types";
import { getPostRoomContext, type PostRoomContext } from "./post-presentation";

/** タイムラインで、同じ人の同じルームへの実況がこの件数以上続いたらたたむ */
export const LIVE_RUN_MIN = 3;

export type TimelineItem =
	| { kind: "post"; post: Post }
	| { kind: "run"; key: string; posts: Post[]; room: PostRoomContext | null };

/** 実況（ルームへの投稿）ならルームのキー。返信とリポストは実況のまとまりに入れない */
function liveRoomKey(post: Post): string | null {
	if (post.repost_context || post.parent_id) return null;
	if (post.event_room) return `event:${post.event_room.id}`;
	if (post.episode_room_id) return `episode-room:${post.episode_room_id}`;
	if (post.broadcast_room_session_id) return `room:${post.broadcast_room_session_id}`;
	return null;
}

/**
 * タイムラインで隣り合う、同じ人の同じルームへの実況を 1 つのまとまりにする（minRun 件以上のときだけ）。
 * 並び順は変えない。間に別の投稿が挟まると、そこでまとまりは切れる
 */
export function groupLiveRuns(posts: readonly Post[], minRun = LIVE_RUN_MIN): TimelineItem[] {
	const items: TimelineItem[] = [];
	let index = 0;
	while (index < posts.length) {
		const first = posts[index] as Post;
		const key = liveRoomKey(first);
		let end = index + 1;
		if (key !== null) {
			while (end < posts.length) {
				const next = posts[end] as Post;
				if (next.user_id !== first.user_id || liveRoomKey(next) !== key) break;
				end += 1;
			}
		}
		if (key !== null && end - index >= minRun) {
			items.push({
				kind: "run",
				key: `run:${first.id}`,
				posts: posts.slice(index, end),
				room: getPostRoomContext(first),
			});
		} else {
			for (const post of posts.slice(index, end)) items.push({ kind: "post", post });
		}
		index = end;
	}
	return items;
}
