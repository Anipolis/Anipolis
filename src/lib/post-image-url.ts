/**
 * 投稿画像の URL の扱い（#316）。クライアントからも使うので $lib/server に置かない。
 *
 * image_urls には Storage の公開 URL の形（…/storage/v1/object/public/post-images/<path>）を
 * 識別子として保存している。バケットは非公開（157）なので、この URL では取得できない。
 *   * ページに出すときは、サーバーが閲覧できる投稿の画像にだけ期限付きの URL を発行して差し替える
 *   * 外に出るリンク（OGP など）と投稿欄のプレビューは、期限の無い /api/media/post-images/<path> を使う
 */
const PUBLIC_URL_MARKER = "/storage/v1/object/public/post-images/";
export const POST_IMAGE_MEDIA_PREFIX = "/api/media/post-images/";

/** 保存している画像の URL から、バケット内のパス（<user_id>/<file>）を取り出す。形式が違えば null */
export function postImagePathFromUrl(url: string): string | null {
	const index = url.indexOf(PUBLIC_URL_MARKER);
	if (index === -1) return null;
	const path = url.slice(index + PUBLIC_URL_MARKER.length).split("?")[0] ?? "";
	if (!path) return null;
	try {
		return decodeURIComponent(path);
	} catch {
		return null;
	}
}

/**
 * 投稿者自身の画像か（パスが <user_id>/… で始まるか）。配信は投稿者本人の画像に限る。
 * 他人の画像を参照する投稿（148 以前に REST の直接 INSERT で作られうる）を経由して、
 * 元の投稿が見えなくなった画像を取得させないため（PR #380 レビュー）。
 */
export function isOwnPostImage(url: string, userId: string): boolean {
	const path = postImagePathFromUrl(url);
	return Boolean(path?.startsWith(`${userId}/`)) && !path?.includes("..");
}

/** 期限の無い画像の固定リンク（相対パス）。形式が違う URL はそのまま返す */
export function postImageMediaUrl(url: string): string {
	const path = postImagePathFromUrl(url);
	if (!path) return url;
	return `${POST_IMAGE_MEDIA_PREFIX}${path.split("/").map(encodeURIComponent).join("/")}`;
}
