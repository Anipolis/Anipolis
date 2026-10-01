// Jikan（MAL）由来カバーの取り込み判定。scripts/import-jikan-covers.ts から使う純粋関数だけを置く。

export type JikanImageSet = {
	jpg?: { image_url?: string | null; small_image_url?: string | null; large_image_url?: string | null } | null;
	webp?: { image_url?: string | null; small_image_url?: string | null; large_image_url?: string | null } | null;
} | null;

export type CoverReview = { status: "approved" } | { status: "needs_review"; reason: string };

/** 保存するカバーの長辺の上限。MAL の large は 600px 前後なので通常は縮小しない */
export const IMPORTED_COVER_MAX_LONG_SIDE = 600;

// 既存カバー（1:1.414）に近い縦長だけを自動承認する。横長のキービジュアルや極端な比率は人が見る
const MIN_APPROVED_ASPECT = 0.62;
const MAX_APPROVED_ASPECT = 0.8;
const MIN_APPROVED_WIDTH = 200;

const MAL_ANIME_IMAGE_PATTERN = /^https:\/\/cdn\.myanimelist\.net\/images\/anime\/\d+\/\d+[a-z]?\.(?:jpg|jpeg|webp)$/i;

/**
 * 取り込みに使う画像 URL を選ぶ。再エンコードの元にするので WebP より JPEG の large を優先する。
 * MAL の「画像なし」プレースホルダー（qm_50.gif など）は作品画像のパターンに当たらないので除外される。
 */
export function selectJikanCoverImageUrl(images: JikanImageSet | undefined): string | null {
	const candidates = [
		images?.jpg?.large_image_url,
		images?.jpg?.image_url,
		images?.webp?.large_image_url,
		images?.webp?.image_url,
	];
	for (const url of candidates) {
		const trimmed = url?.trim();
		if (trimmed && MAL_ANIME_IMAGE_PATTERN.test(trimmed)) return trimmed;
	}
	return null;
}

/** 長辺を上限まで縮める（拡大はしない） */
export function importedCoverSize(width: number, height: number): { width: number; height: number } {
	const longSide = Math.max(width, height);
	if (longSide <= IMPORTED_COVER_MAX_LONG_SIDE) return { width, height };
	const scale = IMPORTED_COVER_MAX_LONG_SIDE / longSide;
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function reviewImportedCover(width: number, height: number): CoverReview {
	if (width <= 0 || height <= 0) return { status: "needs_review", reason: "invalid size" };
	const aspect = width / height;
	if (aspect >= 1) return { status: "needs_review", reason: `not portrait ${width}x${height}` };
	if (aspect < MIN_APPROVED_ASPECT || aspect > MAX_APPROVED_ASPECT) {
		return { status: "needs_review", reason: `aspect ${aspect.toFixed(3)} (${width}x${height})` };
	}
	if (width < MIN_APPROVED_WIDTH) return { status: "needs_review", reason: `small ${width}x${height}` };
	return { status: "approved" };
}

/**
 * バケット直下のオブジェクト名。内容ハッシュを含めて不変にする（同じ名前を上書きしないので長期キャッシュできる）。
 * サムネイルは anime-cover.ts の規約で thumbs/160/ に同じ名前で置く。
 */
export function importedCoverObjectName(malId: number, sha256: string): string {
	return `mal-${malId}-${sha256.slice(0, 12)}.avif`;
}
