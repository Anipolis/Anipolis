import { buildAnimeRoomLabel, buildEventRoomLabel, type Post } from "$lib/types";

/** Only adjacent reactions in the same explicit context can share an author heading. */
export function isPostContinuation(post: Post, previous: Post | undefined): boolean {
	if (!previous || post.user_id !== previous.user_id || post.repost_context || previous.repost_context) return false;
	const context = (item: Post) =>
		item.event_room
			? `event:${item.event_room.id}`
			: item.broadcast_room_session_id
				? `room:${item.broadcast_room_session_id}`
				: item.anime_id
					? `anime:${item.anime_id}`
					: null;
	const key = context(post);
	const elapsed = Math.abs(Date.parse(post.created_at) - Date.parse(previous.created_at));
	return key !== null && key === context(previous) && post.parent_id === previous.parent_id && elapsed <= 120_000;
}

export type PostRoomContext = { href: string; title: string };

function normalizeRoomTag(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

function fallbackRoomTag(title: string) {
	return title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

function getRoomTagCandidates(post: Post) {
	// イベントルームリンク付き投稿: 旧仕様で自動付与されていた末尾タグを非表示にする
	if (post.event_room) {
		return [normalizeRoomTag(post.event_room.hashtag)].filter((tag) => tag.length > 0);
	}
	const anime = post.anime_quote;
	if (!post.broadcast_room_session_id || !anime?.room_href) return [];
	return [
		...(anime.official_hashtag ?? []).map(normalizeRoomTag),
		normalizeRoomTag(fallbackRoomTag(anime.title)),
	].filter((tag) => tag.length > 0);
}

/** Room posts already show their room, so the auto-appended trailing room tag is redundant. */
export function getPostDisplayContent(post: Post): string {
	const content = post.content;
	const roomTags = getRoomTagCandidates(post);
	if (roomTags.length === 0) return content;
	const trimmed = content.trimEnd();
	const normalized = trimmed.toLowerCase();
	for (const tag of roomTags) {
		const suffix = `#${tag}`;
		if (!normalized.endsWith(suffix)) continue;
		const before = trimmed.slice(0, trimmed.length - suffix.length);
		if (before.length > 0 && !/\s$/.test(before)) continue;
		return before.trimEnd();
	}
	return content;
}

export function getPostRoomContext(post: Post): PostRoomContext | null {
	if (post.anime_quote?.room_href) {
		return { href: post.anime_quote.room_href, title: buildAnimeRoomLabel(post.anime_quote) };
	}
	if (post.event_room) {
		return { href: `/events/${post.event_room.id}`, title: buildEventRoomLabel(post.event_room) };
	}
	return null;
}
