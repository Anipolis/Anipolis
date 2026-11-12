// 共有（OGP / X のカード）用のメタ情報の組み立て（#271）。SeoMeta.svelte から使う。

export const SITE_NAME = "Anipolis";
export const DEFAULT_DESCRIPTION = "アニメファンのためのSNS。視聴中のアニメを記録して、感想を投稿・共有しよう。";
/** static/og-default.png（1200x630）。作り方は scripts/generate-og-default.mjs */
export const DEFAULT_OG_IMAGE_PATH = "/og-default.png";
export const DEFAULT_OG_IMAGE_ALT = "Anipolis — アニメを観ながら、みんなで語ろう";

/** 相対 URL を origin 基準の絶対 URL にする。クローラーは相対 URL の og:image を読まない */
export function toAbsoluteUrl(value: string, origin: string): string {
	try {
		return new URL(value, origin).href;
	} catch {
		return value;
	}
}

/**
 * og:url に使う URL。共有の行き先は同じページでも、検索語や開いているタブの違いで
 * 別のカードとして数えられないよう、クエリと # を落とす（ページの本体を指す URL にする）。
 */
export function canonicalUrl(url: URL): string {
	return `${url.origin}${url.pathname}`;
}

/** 説明文用に、改行や連続する空白を 1 つにまとめ、長ければ末尾を「…」で切る */
export function metaText(value: string | null | undefined, maxLength = 120): string {
	const normalized = (value ?? "").replace(/\s+/g, " ").trim();
	if ([...normalized].length <= maxLength) return normalized;
	return `${[...normalized].slice(0, maxLength - 1).join("")}…`;
}

/** 本文が無い投稿・ネタバレ注意の投稿の説明文 */
export function postMetaDescription(input: {
	content: string;
	cwAnimeTitle: string | null;
	hasCw: boolean;
	animeTitle: string | null;
}): string {
	if (input.hasCw) {
		return input.cwAnimeTitle ? `「${input.cwAnimeTitle}」のネタバレを含む投稿です` : "ネタバレを含む投稿です";
	}
	const text = metaText(input.content);
	if (text) return text;
	return input.animeTitle ? `「${input.animeTitle}」についての投稿` : "Anipolis の投稿";
}

/** X やチャットで共有するときの文面（タイトル＋URL は共有先が付けるので、ここではタイトルだけ） */
export function shareText(title: string): string {
	return title.endsWith(` - ${SITE_NAME}`) ? title : `${title} - ${SITE_NAME}`;
}

/** X の投稿画面を開く URL */
export function xIntentUrl(text: string, url: string): string {
	const params = new URLSearchParams({ text, url });
	return `https://x.com/intent/post?${params.toString()}`;
}

/**
 * カードに使える画像か。作品のカバーは AVIF で保存しているが、X・Facebook・Slack の
 * カードは AVIF を表示しない（JPEG・PNG・WebP・GIF のみ）。使えない画像は null にして、
 * 既定の画像（og-default.png）に任せる。
 */
export function crawlerSafeImage(url: string | null | undefined): string | null {
	if (!url) return null;
	const path = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
	return path.endsWith(".avif") ? null : url;
}
