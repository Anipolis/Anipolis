// アニメカバー画像のサムネイル規約。アプリ（表示）とスクリプト（生成）で共有するので
// $lib エイリアスや SvelteKit 固有の import を持ち込まないこと。
//
// 原寸: anime-covers/<name>.<ext>
// サムネイル: anime-covers/thumbs/160/<name>.avif
// サムネイルは scripts/generate-cover-thumbnails.ts が後追いで生成するため、
// 存在しない可能性がある。表示側（CoverImage）は読み込み失敗時に原寸へ戻す。

export const ANIME_COVER_BUCKET = "anime-covers";
export const COVER_THUMB_WIDTH = 160;
export const COVER_THUMB_PREFIX = `thumbs/${COVER_THUMB_WIDTH}/`;

const PUBLIC_OBJECT_MARKER = `/storage/v1/object/public/${ANIME_COVER_BUCKET}/`;

/** バケット直下の原寸カバーのオブジェクト名か（サムネイルやサブフォルダは除く） */
export function isCoverSourceObject(name: string): boolean {
	return name.length > 0 && !name.includes("/") && !name.startsWith(".") && /\.[a-z0-9]+$/i.test(name);
}

/** 原寸カバーのオブジェクト名からサムネイルのオブジェクト名を得る */
export function coverThumbObjectName(sourceName: string): string {
	return `${COVER_THUMB_PREFIX}${sourceName.replace(/\.[^.]+$/, "")}.avif`;
}

/** anime-covers の公開 URL ならバケット内のオブジェクト名を返す */
export function coverObjectNameFromUrl(url: string): string | null {
	const index = url.indexOf(PUBLIC_OBJECT_MARKER);
	if (index < 0) return null;
	const rest = url.slice(index + PUBLIC_OBJECT_MARKER.length).split(/[?#]/)[0] ?? "";
	let name: string;
	try {
		name = decodeURIComponent(rest);
	} catch {
		return null;
	}
	return isCoverSourceObject(name) ? name : null;
}

/** カバーの公開 URL からサムネイルの公開 URL を得る。対象外の URL は null */
export function coverThumbUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	const name = coverObjectNameFromUrl(url);
	if (!name) return null;
	const index = url.indexOf(PUBLIC_OBJECT_MARKER);
	const base = url.slice(0, index + PUBLIC_OBJECT_MARKER.length);
	return base + coverThumbObjectName(name).split("/").map(encodeURIComponent).join("/");
}
