import { describe, expect, it } from "vitest";
import {
	ANIME_GENRE_GROUPS,
	ANIME_GENRES,
	GENRE_JA_BY_EN,
	groupGenreFilters,
	LEGACY_GENRE_JA,
	translateAnimeGenres,
} from "./anime-vocabulary";

describe("アニメのジャンル語彙", () => {
	it("英語名・日本語名ともに重複しない", () => {
		const tags = ANIME_GENRE_GROUPS.flatMap((group) => group.tags);
		expect(new Set(tags.map((tag) => tag.en.toLowerCase())).size).toBe(tags.length);
		expect(new Set(tags.map((tag) => tag.ja)).size).toBe(tags.length);
	});

	it("取り込みで保存しうる訳はすべて絞り込みの選択肢に出る", () => {
		expect([...ANIME_GENRES].sort()).toEqual(Object.values(GENRE_JA_BY_EN).sort());
	});

	it("MAL のジャンル・テーマ・対象層を日本語に訳す(大文字小文字は区別しない)", () => {
		expect(translateAnimeGenres(["Action", "urban fantasy", "Love Status Quo", "Hentai", "Kids"])).toEqual([
			"アクション",
			"現代ファンタジー",
			"もどかしい恋",
			"成人向け",
			"子ども向け",
		]);
	});

	it("旧表記は現在の表記に直す(取り込み元や URL に残る旧表記のため)", () => {
		expect(translateAnimeGenres(["オカルト", "超常現象", "侍", "芸能", "ショービズ"])).toEqual([
			"超常現象",
			"武士",
			"舞台芸術",
			"芸能界",
		]);
	});

	it("組み込みのプロパティ名と同じタグも、未知のタグとして文字列のまま残す", () => {
		expect(translateAnimeGenres(["constructor", "toString", "__proto__", "hasOwnProperty"])).toEqual([
			"constructor",
			"toString",
			"__proto__",
			"hasOwnProperty",
		]);
		expect(groupGenreFilters(["constructor", "__proto__"])).toEqual([["constructor"], ["__proto__"]]);
	});

	it("旧表記はどれも現在の語彙に無く、読み替え先は現在の語彙にある", () => {
		for (const [legacy, current] of Object.entries(LEGACY_GENRE_JA)) {
			expect(ANIME_GENRES, legacy).not.toContain(legacy);
			expect(ANIME_GENRES, current).toContain(current);
		}
	});

	it("訳済みの値と未知の名前はそのまま残し、重複は除く", () => {
		expect(translateAnimeGenres(["アクション", "Action", "Brand New Theme"])).toEqual([
			"アクション",
			"Brand New Theme",
		]);
	});
});

describe("絞り込み用のタグの種類分け", () => {
	it("同じ種類のタグはひとまとめにし、種類ごとに分ける", () => {
		expect(groupGenreFilters(["アクション", "異世界", "コメディ", "少年向け", "学園"])).toEqual([
			["アクション", "コメディ"],
			["異世界", "学園"],
			["少年向け"],
		]);
	});

	it("英語名も同じ種類として扱う", () => {
		expect(groupGenreFilters(["Action", "コメディ"])).toEqual([["Action", "コメディ"]]);
	});

	it("語彙にないタグはそれぞれ独立した種類にする", () => {
		expect(groupGenreFilters(["アクション", "独自タグA", "独自タグB"])).toEqual([
			["アクション"],
			["独自タグA"],
			["独自タグB"],
		]);
	});

	it("何も選ばれていなければ空", () => {
		expect(groupGenreFilters([])).toEqual([]);
	});
});
