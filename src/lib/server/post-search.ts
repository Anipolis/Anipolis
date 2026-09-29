/**
 * 全体検索の投稿検索: 本文一致に加えて「検索語に一致する作品を引用した投稿」も返す。
 * 例: 「レイアース」で検索すると、本文に作品名が無くても「魔法騎士レイアース」の引用投稿が出る。
 *
 * - 作品の特定は既存のアニメ検索と同じ条件（日本語題・英題・ひらがな読み）を使う
 * - 1 文字の検索語は作品が大量に一致する（「の」で 1,000 件超）ので作品一致を使わない
 * - 一致した作品が多すぎる場合も作品一致を使わず本文一致だけにする（IN 句の肥大化を避ける）
 * - 作品一致で拾うのは「引用投稿」だけ。実況ルーム・イベントルームの投稿は投稿時に作品が自動で
 *   付くので除外し、従来どおり本文一致（公式ハッシュタグ）でのみ拾う
 * - ネタバレ指定（CW）付きの投稿も作品一致では拾わない。検索設定で選べるようにするかは今後の検討事項
 */
import { escapeIlikePattern } from "$lib/utils/search";

/** 作品一致を使う検索語の最小文字数（書記素ではなくコードポイント単位で数える） */
export const MIN_ANIME_MATCH_QUERY_LENGTH = 2;
/** これを超えて作品が一致したら、作品一致は使わない */
export const MAX_ANIME_MATCHES = 50;
/** 検索結果の上部に出す作品の件数 */
export const ANIME_SECTION_LIMIT = 6;

export type AnimeSearchHit = {
	id: number;
	title: string;
	title_en: string | null;
	cover_url: string | null;
};

export function shouldMatchQuotedAnime(query: string): boolean {
	return [...query.trim()].length >= MIN_ANIME_MATCH_QUERY_LENGTH;
}

/** PostgREST の .or() に埋め込む値を引用符リテラルにする（queries.ts の quoteOrFilterValue と同じ規則） */
function quoteFilterValue(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 投稿検索の .or() フィルター。
 * 本文一致 OR（一致作品の引用 AND ルーム・イベント・ネタバレ指定の投稿ではない）。
 * 作品 ID が無ければ本文一致だけ。
 */
export function buildPostSearchFilter(query: string, animeIds: readonly number[]): string {
	const content = `content.ilike.${quoteFilterValue(`%${escapeIlikePattern(query)}%`)}`;
	const ids = [...new Set(animeIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
	if (ids.length === 0) return content;
	return `${content},and(anime_id.in.(${ids.join(",")}),broadcast_room_session_id.is.null,event_id.is.null,cw_anime_id.is.null)`;
}

/** 一致した作品のうち、投稿検索に使う ID（多すぎるときは使わない） */
export function quotedAnimeIdsForSearch(hits: readonly AnimeSearchHit[]): number[] {
	if (hits.length > MAX_ANIME_MATCHES) return [];
	return hits.map((hit) => hit.id);
}

/**
 * 検索結果の上部に出す作品の並び: 題名の完全一致 → 前方一致 → それ以外、同順位は短い題名を先に。
 * 「レイアース」なら「魔法騎士レイアース」より「レイアース」そのものがあれば先に出す。
 */
export function rankAnimeMatches(query: string, hits: readonly AnimeSearchHit[]): AnimeSearchHit[] {
	const needle = query.trim().toLowerCase();
	const score = (hit: AnimeSearchHit) => {
		const titles = [hit.title, hit.title_en ?? ""].map((title) => title.toLowerCase());
		if (titles.some((title) => title === needle)) return 0;
		if (titles.some((title) => title.startsWith(needle))) return 1;
		return 2;
	};
	return [...hits].sort((a, b) => score(a) - score(b) || a.title.length - b.title.length || a.id - b.id);
}
