import type { Anime } from "$lib/types";
import { animeTypeLabel } from "./anime-labels";

/** 作品を選ぶ画面（AnimePickerModal）で扱う作品。検索 API（/api/anime/search）の結果と同じ形 */
export interface AnimePick {
	id: number;
	title: string;
	cover_url: string | null;
	type?: string | null | undefined;
	aired_from?: string | null | undefined;
}

export function toAnimePick(anime: Anime): AnimePick {
	return {
		id: Number(anime.id),
		title: anime.title,
		cover_url: anime.cover_url,
		type: anime.type,
		aired_from: anime.aired_from,
	};
}

/** 同じ名前の作品を見分けるための「2018年・TV」。分からない部分は省く */
export function animePickMeta(anime: {
	type?: string | null | undefined;
	aired_from?: string | null | undefined;
}): string {
	const year = anime.aired_from?.slice(0, 4);
	const type = animeTypeLabel(anime.type);
	return [year ? `${year}年` : null, type].filter(Boolean).join("・");
}
