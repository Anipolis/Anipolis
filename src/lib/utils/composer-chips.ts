/**
 * 投稿フォームに表示する添付チップ（アニメ引用・ネタバレCW）のラベル生成。
 * 表示ロジックを UI から切り離して単体テストできるようにする。
 */

export interface ChipAnime {
	title: string;
	title_en?: string | null;
	official_hashtag?: string[] | null;
}

/** `#` の重複や前後の空白を整えたハッシュタグ表記を返す。空なら空文字。 */
export function normalizeHashtagLabel(tag: string): string {
	const normalized = tag.trim().replace(/^#+/, "");
	return normalized ? `#${normalized}` : "";
}

/** アニメ引用チップ: 公式ハッシュタグがあればそれを、なければタイトルをハッシュタグ化して表示する */
export function animeQuoteChipLabel(anime: ChipAnime): string {
	return anime.official_hashtag?.map(normalizeHashtagLabel).find(Boolean) ?? normalizeHashtagLabel(anime.title);
}

/** チップに載せる作品名。日本語題が空なら英題、それもなければ汎用表記に落とす。 */
export function chipAnimeTitle(anime: ChipAnime): string {
	return anime.title.trim() || anime.title_en?.trim() || "作品名不明";
}

/**
 * ネタバレCWチップ: どの作品のネタバレ保護かを常に確認できるよう作品名を添える（GitLab #9）。
 * 引用チップ（ハッシュタグ表記）と役割を区別するため「ネタバレ:」を接頭辞にする。
 */
export function cwChipLabel(anime: ChipAnime): string {
	return `ネタバレ: ${chipAnimeTitle(anime)}`;
}
