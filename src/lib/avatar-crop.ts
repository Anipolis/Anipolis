/**
 * アイコンの切り抜き（AvatarCropper）の計算。画面に依存しない部分だけを置く。
 *
 * 画像は正方形の枠（一辺 view px）の中に、左上を (x, y)、倍率 scale で置く。
 * 枠は常に画像で埋まっている（隙間ができない）ように、倍率と位置を制限する。
 */

export interface CropState {
	/** 画像の左上の位置（枠の左上からの px。0 以下） */
	x: number;
	y: number;
	/** 画像の表示倍率（元の 1px が何 px になるか） */
	scale: number;
}

/** 選べる元の画像の大きさ。切り抜いて小さくしてから送るので、送れる上限（2MB）より大きい写真も選べる */
export const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024;
export const AVATAR_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 選んだ画像を切り抜きに回せるか。だめなら利用者に見せる理由 */
export function checkAvatarSource(file: File): string | null {
	// 決まりは画面に書かず、外れたときだけ伝える（形式と大きさのどちらでも同じ文）
	if (!AVATAR_SOURCE_TYPES.includes(file.type) || file.size > MAX_AVATAR_SOURCE_BYTES) {
		return "10MB以下の画像（JPEG・PNG・WebP）を選んでください";
	}
	return null;
}

/** 切り抜いた画像の一辺（px） */
export const AVATAR_OUTPUT_SIZE = 512;
/** いちばん小さい倍率（枠をちょうど埋める）から何倍まで拡大できるか */
export const MAX_ZOOM = 4;

/** 枠をちょうど埋める倍率（短い辺が枠に合う） */
export function coverScale(width: number, height: number, view: number): number {
	return Math.max(view / width, view / height);
}

/** 画像が枠からはみ出さない（隙間ができない）ように、位置を戻す */
export function clampOffset(state: CropState, width: number, height: number, view: number): CropState {
	const minX = view - width * state.scale;
	const minY = view - height * state.scale;
	return {
		scale: state.scale,
		x: Math.min(0, Math.max(minX, state.x)),
		y: Math.min(0, Math.max(minY, state.y)),
	};
}

/** 最初の状態: 枠をちょうど埋める倍率で、画像の真ん中を枠の真ん中に置く */
export function initialCrop(width: number, height: number, view: number): CropState {
	const scale = coverScale(width, height, view);
	return { scale, x: (view - width * scale) / 2, y: (view - height * scale) / 2 };
}

/**
 * 倍率を変える。枠の中の点 (cx, cy)（指やマウスの位置。省略時は枠の真ん中）が、画像の同じ場所を指したままになるようにする
 */
export function zoomTo(
	state: CropState,
	nextScale: number,
	width: number,
	height: number,
	view: number,
	cx = view / 2,
	cy = view / 2,
): CropState {
	const min = coverScale(width, height, view);
	const scale = Math.min(min * MAX_ZOOM, Math.max(min, nextScale));
	const ratio = scale / state.scale;
	return clampOffset({ scale, x: cx - (cx - state.x) * ratio, y: cy - (cy - state.y) * ratio }, width, height, view);
}

/** 元の画像のどこを切り抜くか（元の画像の px。正方形） */
export function sourceRect(state: CropState, view: number): { sx: number; sy: number; size: number } {
	// 0 - x にして、x が 0 のとき -0 にならないようにする
	return { sx: (0 - state.x) / state.scale, sy: (0 - state.y) / state.scale, size: view / state.scale };
}
