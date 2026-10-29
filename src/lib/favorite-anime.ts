import { animeTypeLabel } from "./anime-labels";

/** プロフィールのベスト作品に並べられる数（DB の制約 178_favorite_anime と同じ） */
export const MAX_FAVORITE_ANIME = 10;

/** 同じ名前の作品を見分けるための「2018年・TV」。分からない部分は省く */
export function favoriteAnimeMeta(anime: {
	type?: string | null | undefined;
	aired_from?: string | null | undefined;
}): string {
	const year = anime.aired_from?.slice(0, 4);
	const type = animeTypeLabel(anime.type);
	return [year ? `${year}年` : null, type].filter(Boolean).join("・");
}
