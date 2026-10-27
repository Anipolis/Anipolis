/** プロフィールのベスト作品に並べられる数（DB の制約 178_favorite_anime と同じ） */
export const MAX_FAVORITE_ANIME = 10;

// カタログのタイプ（MAL 由来の英語表記）のうち、日本語で出すもの
const TYPE_LABELS: Record<string, string> = { Movie: "映画", Special: "特別" };

/** 同じ名前の作品を見分けるための「2018年・TV」。分からない部分は省く */
export function favoriteAnimeMeta(anime: {
	type?: string | null | undefined;
	aired_from?: string | null | undefined;
}): string {
	const year = anime.aired_from?.slice(0, 4);
	const type = anime.type ? (TYPE_LABELS[anime.type] ?? anime.type) : null;
	return [year ? `${year}年` : null, type].filter(Boolean).join("・");
}
