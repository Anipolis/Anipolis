import { describe, expect, it } from "vitest";
import { clampOffset, coverScale, initialCrop, MAX_ZOOM, sourceRect, zoomTo } from "./image-crop";

const SQUARE = { width: 300, height: 300 };
const WIDE = { width: 450, height: 150 };

describe("画像の切り抜きの計算", () => {
	it("最初は枠を埋める倍率にし、画像の真ん中を枠の真ん中に置く", () => {
		// 横長 1200×600: 高さが枠に合う（倍率 0.5、幅は 600px で左右に 150px ずつはみ出す）
		expect(initialCrop(1200, 600, SQUARE)).toEqual({ scale: 0.5, x: -150, y: 0 });
		// 縦長 400×800
		expect(initialCrop(400, 800, SQUARE)).toEqual({ scale: 0.75, x: 0, y: -150 });
		// 横長の枠: 1200×600 は幅が枠に合う（倍率 0.375、高さ 225px で上下に 37.5px ずつはみ出す）
		expect(initialCrop(1200, 600, WIDE)).toEqual({ scale: 0.375, x: 0, y: -37.5 });
	});

	it("動かしても枠に隙間ができない位置に戻す", () => {
		const scale = coverScale(1200, 600, SQUARE);
		expect(clampOffset({ scale, x: 50, y: 20 }, 1200, 600, SQUARE)).toEqual({ scale, x: 0, y: 0 });
		expect(clampOffset({ scale, x: -1000, y: -20 }, 1200, 600, SQUARE)).toEqual({ scale, x: -300, y: 0 });
		const wide = coverScale(1200, 600, WIDE);
		expect(clampOffset({ scale: wide, x: -10, y: -100 }, 1200, 600, WIDE)).toEqual({ scale: wide, x: 0, y: -75 });
	});

	it("拡大は枠を埋める倍率から MAX_ZOOM 倍までに収める", () => {
		const start = initialCrop(600, 600, SQUARE);
		expect(zoomTo(start, 0.01, 600, 600, SQUARE).scale).toBe(0.5);
		expect(zoomTo(start, 100, 600, 600, SQUARE).scale).toBe(0.5 * MAX_ZOOM);
	});

	it("拡大しても、指している画像の場所は動かない", () => {
		const start = initialCrop(600, 600, SQUARE); // 倍率 0.5、(0, 0)
		// 枠の真ん中（150, 150）は元の画像の (300, 300) を指している
		const zoomed = zoomTo(start, 1, 600, 600, SQUARE);
		const pointed = { x: (150 - zoomed.x) / zoomed.scale, y: (150 - zoomed.y) / zoomed.scale };
		expect(pointed).toEqual({ x: 300, y: 300 });
	});

	it("切り抜く範囲は、枠に見えている部分（元の画像の px）", () => {
		expect(sourceRect({ scale: 0.5, x: -150, y: 0 }, SQUARE)).toEqual({ sx: 300, sy: 0, width: 600, height: 600 });
		expect(sourceRect({ scale: 2, x: -100, y: -40 }, SQUARE)).toEqual({ sx: 50, sy: 20, width: 150, height: 150 });
		// 横長の枠は 3:1 の範囲になる
		expect(sourceRect({ scale: 0.375, x: 0, y: -37.5 }, WIDE)).toEqual({
			sx: 0,
			sy: 100,
			width: 1200,
			height: 400,
		});
	});
});
