import type { Anime } from "$lib/types";

/** マイリストの並び替え。URL の ?sort= に入れる値 */
export const MYLIST_SORTS = [
	{ value: "updated", label: "更新が新しい順" },
	{ value: "created_desc", label: "登録が新しい順" },
	{ value: "created_asc", label: "登録が古い順" },
	{ value: "score_desc", label: "スコアが高い順" },
	{ value: "score_asc", label: "スコアが低い順" },
	{ value: "aired_desc", label: "放送が新しい順" },
	{ value: "aired_asc", label: "放送が古い順" },
] as const;

export type MylistSort = (typeof MYLIST_SORTS)[number]["value"];

export const DEFAULT_MYLIST_SORT: MylistSort = "updated";

export function parseMylistSort(value: string | null | undefined): MylistSort {
	return MYLIST_SORTS.find((sort) => sort.value === value)?.value ?? DEFAULT_MYLIST_SORT;
}

const SEASON_MONTHS: Record<string, string> = { winter: "01", spring: "04", summer: "07", fall: "10" };

/**
 * 放送時期を比べられる形（YYYY-MM-DD）にする。放送開始日があればそれ、無ければ
 * 「2026-spring」などの季節の最初の月。どちらも無ければ null
 */
function airedKey(anime: Anime): string | null {
	if (anime.aired_from) return anime.aired_from.slice(0, 10);
	const match = /^(\d{4})(?:-(winter|spring|summer|fall))?/.exec(anime.season ?? "");
	if (!match) return null;
	return `${match[1]}-${match[2] ? SEASON_MONTHS[match[2]] : "01"}-01`;
}

type SortKey = { value: number | string | null; descending: boolean };

function sortKey(anime: Anime, sort: MylistSort): SortKey {
	const entry = anime.user_entry;
	switch (sort) {
		case "created_desc":
		case "created_asc":
			// 登録日時を読んでいなければ、更新日時で代わりにする
			return { value: entry?.created_at ?? entry?.updated_at ?? null, descending: sort === "created_desc" };
		case "score_desc":
		case "score_asc":
			return { value: entry?.score ?? null, descending: sort === "score_desc" };
		case "aired_desc":
		case "aired_asc":
			return { value: airedKey(anime), descending: sort === "aired_desc" };
		default:
			return { value: entry?.updated_at ?? null, descending: true };
	}
}

function compareValues(a: number | string, b: number | string): number {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/**
 * マイリストの作品を並べ替えた新しい配列を返す。値の無い作品（スコア無し・放送時期不明）は
 * どちらの向きでも最後に回し、同じ値どうしは更新が新しい順にする
 */
export function sortMylist(animes: readonly Anime[], sort: MylistSort): Anime[] {
	return [...animes].sort((a, b) => {
		const keyA = sortKey(a, sort);
		const keyB = sortKey(b, sort);
		if (keyA.value == null || keyB.value == null) {
			if (keyA.value != null) return -1;
			if (keyB.value != null) return 1;
		} else {
			const compared = compareValues(keyA.value, keyB.value);
			if (compared !== 0) return keyA.descending ? -compared : compared;
		}
		return compareValues(b.user_entry?.updated_at ?? "", a.user_entry?.updated_at ?? "");
	});
}
