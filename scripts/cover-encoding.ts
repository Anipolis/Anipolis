// カバー画像のエンコード設定。generate-cover-thumbnails.ts と import-jikan-covers.ts で共有する。

import sharp from "sharp";
import { COVER_THUMB_WIDTH } from "../src/lib/anime-cover.ts";
import { importedCoverSize } from "../src/lib/anime-cover-import.ts";

const COVER_AVIF_QUALITY = 50;
const COVER_AVIF_EFFORT = 4;

/** 表示用サムネイル（幅 160px の AVIF） */
export async function renderCoverThumbnail(source: Buffer): Promise<Buffer> {
	return sharp(source)
		.rotate()
		.resize({ width: COVER_THUMB_WIDTH, withoutEnlargement: true })
		.avif({ quality: COVER_AVIF_QUALITY, effort: COVER_AVIF_EFFORT })
		.toBuffer();
}

/** 取り込んだ元画像を、元のサイズのまま（長辺 600px を超える場合だけ縮小して）AVIF にする */
export async function encodeImportedCover(source: Buffer) {
	const metadata = await sharp(source).rotate().metadata();
	const sourceWidth = metadata.autoOrient?.width ?? metadata.width;
	const sourceHeight = metadata.autoOrient?.height ?? metadata.height;
	if (!sourceWidth || !sourceHeight) throw new Error("Could not read the image size");
	const target = importedCoverSize(sourceWidth, sourceHeight);
	const { data, info } = await sharp(source)
		.rotate()
		.resize({ width: target.width, height: target.height, fit: "fill" })
		.avif({ quality: COVER_AVIF_QUALITY, effort: COVER_AVIF_EFFORT })
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height, sourceWidth, sourceHeight };
}
