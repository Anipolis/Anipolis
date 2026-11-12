// 作品ごとの共有用カード画像（OGP、1200x630 の JPEG）の命名規約（#271）。
// アプリ（/og/anime/[id] で配信）とスクリプト（scripts/generate-anime-og-cards.ts で生成）が共有するので、
// $lib エイリアスや SvelteKit 固有の import を持ち込まないこと。
//
// カード: anime-covers/og/<原寸カバーの名前（拡張子なし）>-<題名・©・期・種類のハッシュ>.jpg
// 題名や © が変わればハッシュが変わり、別の名前になる（古いカードは使われなくなるだけ）。
// カバーは AVIF で保存していて X・Facebook・Slack のカードに出ないため、JPEG で作る。

import { coverObjectNameFromUrl } from "./anime-cover.ts";

export const ANIME_OG_PREFIX = "og/";
export const ANIME_OG_WIDTH = 1200;
export const ANIME_OG_HEIGHT = 630;

export interface AnimeOgSource {
	title: string;
	cover_url: string | null;
	copyright: string | null;
	season: string | null;
	type: string | null;
}

/** 32bit FNV-1a。Workers と Node の両方で同じ値になるよう、crypto を使わない */
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		hash ^= code;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

/** カードを作れる作品か（カバーがあり、© が付いていて作品ページでカバーを出している） */
export function canRenderAnimeOg(anime: AnimeOgSource): boolean {
	return Boolean(anime.cover_url && anime.copyright?.trim() && coverObjectNameFromUrl(anime.cover_url));
}

/** カードのオブジェクト名。作れない作品は null */
export function animeOgObjectName(anime: AnimeOgSource): string | null {
	if (!canRenderAnimeOg(anime) || !anime.cover_url) return null;
	const coverName = coverObjectNameFromUrl(anime.cover_url);
	if (!coverName) return null;
	const base = coverName.replace(/\.[^.]+$/, "");
	const hash = fnv1a(
		[anime.title, anime.copyright?.trim() ?? "", anime.season ?? "", anime.type ?? ""].join("\u0000"),
	);
	return `${ANIME_OG_PREFIX}${base}-${hash}.jpg`;
}

/** カードの公開 URL（cover_url と同じバケットの公開 URL を基準にする）。作れない作品は null */
export function animeOgPublicUrl(anime: AnimeOgSource): string | null {
	const name = animeOgObjectName(anime);
	if (!name || !anime.cover_url) return null;
	const coverName = coverObjectNameFromUrl(anime.cover_url);
	if (!coverName) return null;
	const marker = anime.cover_url.lastIndexOf("/");
	const base = anime.cover_url.slice(0, marker + 1);
	return base + name.split("/").map(encodeURIComponent).join("/");
}
