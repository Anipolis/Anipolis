import type { Anime } from "$lib/types";

/** 公式ハッシュタグが無い作品は、タイトルから空白と記号を除いたものをルームのハッシュタグにする */
function fallbackRoomHashtag(title: string) {
	return title.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_]/gu, "");
}

function normalizeHashtag(value: string) {
	return value.trim().replace(/^#+/, "").toLowerCase();
}

/** ルームの投稿に付けるハッシュタグ（公式ハッシュタグの先頭、無ければタイトル由来） */
export function roomHashtag(anime: Pick<Anime, "official_hashtag" | "title">) {
	const officialHashtag = anime.official_hashtag?.map(normalizeHashtag).find((tag) => tag.length > 0);
	return officialHashtag ?? fallbackRoomHashtag(anime.title);
}

/** 本文の末尾に手で付けたルームのハッシュタグを外す（ルームが自動で付けるので二重にしない） */
export function stripTrailingRoomHashtag(content: string, hashtag: string) {
	const tag = normalizeHashtag(hashtag);
	if (!tag) return content.trim();
	const trimmed = content.trim();
	const normalized = trimmed.toLowerCase();
	const suffix = `#${tag}`;
	if (!normalized.endsWith(suffix)) return trimmed;
	const before = trimmed.slice(0, trimmed.length - suffix.length);
	if (before.length > 0 && !/\s$/.test(before)) return trimmed;
	return before.trimEnd();
}
