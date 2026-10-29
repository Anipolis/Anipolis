// カタログのタイプ（MAL 由来の英語表記）のうち、日本語や分かりやすい名前で出すもの
const TYPE_LABELS: Record<string, string> = { Movie: "映画", Special: "特別", ONA: "Web" };

// 関連作品の種類（MAL の relation_type）の表示名。「その他（Other）」は段の名前と重なるので出さない
const RELATION_LABELS: Record<string, string> = {
	"Side Story": "外伝",
	"Parent Story": "本編",
	"Full Story": "本編",
	Summary: "総集編",
	"Alternative Version": "別バージョン",
	"Alternative Setting": "別設定",
	"Spin-Off": "スピンオフ",
	Character: "同じキャラクター",
};

/** 関連作品の種類の表示名。「その他」や分からない種類は null（出さない） */
export function animeRelationLabel(relationType: string): string | null {
	return RELATION_LABELS[relationType] ?? null;
}

const SEASON_LABELS: Record<string, string> = { winter: "冬", spring: "春", summer: "夏", fall: "秋" };

/** 作品の種別の表示名（TV・映画・OVA・Web・特別） */
export function animeTypeLabel(type: string | null | undefined): string | null {
	return type ? (TYPE_LABELS[type] ?? type) : null;
}

/** "2026-spring" → "2026年春"。決まった形でなければそのまま返す */
export function animeSeasonLabel(season: string | null | undefined): string | null {
	if (!season) return null;
	const match = /^(\d{4})-(winter|spring|summer|fall)$/.exec(season);
	return match ? `${match[1]}年${SEASON_LABELS[match[2] as string]}` : season;
}

/**
 * アニメ一覧のカードの下に出す「TV・2026年春」。映画は季節に意味がないので年だけにする。
 * 分からない部分は省く
 */
export function animeCardMeta(anime: { type?: string | null; season?: string | null }): string {
	const type = animeTypeLabel(anime.type);
	const year = anime.season?.match(/^\d{4}/)?.[0];
	const when = anime.type === "Movie" ? (year ? `${year}年` : null) : animeSeasonLabel(anime.season);
	return [type, when].filter(Boolean).join("・");
}
