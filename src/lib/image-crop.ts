/**
 * 画像の切り抜き（ImageCropper）の計算。画面に依存しない部分だけを置く。
 *
 * 画像は枠（幅 frame.width × 高さ frame.height px）の中に、左上を (x, y)、倍率 scale で置く。
 * 枠は常に画像で埋まっている（隙間ができない）ように、倍率と位置を制限する。
 * アイコンは正方形の枠、ヘッダー画像は横長（3:1）の枠で使う。
 */

export interface CropState {
	/** 画像の左上の位置（枠の左上からの px。0 以下） */
	x: number;
	y: number;
	/** 画像の表示倍率（元の 1px が何 px になるか） */
	scale: number;
}

export interface Frame {
	width: number;
	height: number;
}

/** 何を切り抜くか。枠の縦横比と、出来上がる画像の大きさ */
export interface CropShape {
	/** 幅 ÷ 高さ */
	aspect: number;
	outputWidth: number;
	outputHeight: number;
}

export const AVATAR_CROP: CropShape = { aspect: 1, outputWidth: 512, outputHeight: 512 };
/** プロフィールのヘッダーと同じ 3:1（パソコンでもスマホでも、この比率で表示する） */
export const HEADER_CROP: CropShape = { aspect: 3, outputWidth: 1500, outputHeight: 500 };

/**
 * 選べる元の画像の大きさ。切り抜いて小さくしてから送るので、送れる上限
 * （アイコン 2MB・ヘッダー 5MB）より大きい写真も選べる
 */
export const MAX_CROP_SOURCE_BYTES = 10 * 1024 * 1024;
export const CROP_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 選んだ画像を切り抜きに回せるか。だめなら利用者に見せる理由 */
export function checkCropSource(file: File): string | null {
	// 決まりは画面に書かず、外れたときだけ伝える（形式と大きさのどちらでも同じ文）
	if (!CROP_SOURCE_TYPES.includes(file.type) || file.size > MAX_CROP_SOURCE_BYTES) {
		return "10MB以下の画像（JPEG・PNG・WebP）を選んでください";
	}
	return null;
}

/** いちばん小さい倍率（枠をちょうど埋める）から何倍まで拡大できるか */
export const MAX_ZOOM = 4;

/** 枠をちょうど埋める倍率（画像が枠より細い方の辺で合わせる） */
export function coverScale(width: number, height: number, frame: Frame): number {
	return Math.max(frame.width / width, frame.height / height);
}

/** 画像が枠からはみ出さない（隙間ができない）ように、位置を戻す */
export function clampOffset(state: CropState, width: number, height: number, frame: Frame): CropState {
	const minX = frame.width - width * state.scale;
	const minY = frame.height - height * state.scale;
	return {
		scale: state.scale,
		x: Math.min(0, Math.max(minX, state.x)),
		y: Math.min(0, Math.max(minY, state.y)),
	};
}

/** 最初の状態: 枠をちょうど埋める倍率で、画像の真ん中を枠の真ん中に置く */
export function initialCrop(width: number, height: number, frame: Frame): CropState {
	const scale = coverScale(width, height, frame);
	return { scale, x: (frame.width - width * scale) / 2, y: (frame.height - height * scale) / 2 };
}

/**
 * 倍率を変える。枠の中の点 (cx, cy)（指やマウスの位置。省略時は枠の真ん中）が、画像の同じ場所を指したままになるようにする
 */
export function zoomTo(
	state: CropState,
	nextScale: number,
	width: number,
	height: number,
	frame: Frame,
	cx = frame.width / 2,
	cy = frame.height / 2,
): CropState {
	const min = coverScale(width, height, frame);
	const scale = Math.min(min * MAX_ZOOM, Math.max(min, nextScale));
	const ratio = scale / state.scale;
	return clampOffset({ scale, x: cx - (cx - state.x) * ratio, y: cy - (cy - state.y) * ratio }, width, height, frame);
}

/** 元の画像のどこを切り抜くか（元の画像の px） */
export function sourceRect(state: CropState, frame: Frame): { sx: number; sy: number; width: number; height: number } {
	// 0 - x にして、x が 0 のとき -0 にならないようにする
	return {
		sx: (0 - state.x) / state.scale,
		sy: (0 - state.y) / state.scale,
		width: frame.width / state.scale,
		height: frame.height / state.scale,
	};
}
