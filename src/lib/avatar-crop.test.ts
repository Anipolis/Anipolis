import { describe, expect, it } from "vitest";
import { clampOffset, coverScale, initialCrop, MAX_ZOOM, sourceRect, zoomTo } from "./avatar-crop";

const VIEW = 300;

describe("アイコンの切り抜きの計算", () => {
	it("最初は短い辺を枠に合わせ、画像の真ん中を枠の真ん中に置く", () => {
		// 横長 1200×600: 高さが枠に合う（倍率 0.5、幅は 600px で左右に 150px ずつはみ出す）
		expect(initialCrop(1200, 600, VIEW)).toEqual({ scale: 0.5, x: -150, y: 0 });
		// 縦長 400×800
		expect(initialCrop(400, 800, VIEW)).toEqual({ scale: 0.75, x: 0, y: -150 });
	});

	it("動かしても枠に隙間ができない位置に戻す", () => {
		const scale = coverScale(1200, 600, VIEW);
		expect(clampOffset({ scale, x: 50, y: 20 }, 1200, 600, VIEW)).toEqual({ scale, x: 0, y: 0 });
		expect(clampOffset({ scale, x: -1000, y: -20 }, 1200, 600, VIEW)).toEqual({ scale, x: -300, y: 0 });
	});

	it("拡大は枠を埋める倍率から MAX_ZOOM 倍までに収める", () => {
		const start = initialCrop(600, 600, VIEW);
		expect(zoomTo(start, 0.01, 600, 600, VIEW).scale).toBe(0.5);
		expect(zoomTo(start, 100, 600, 600, VIEW).scale).toBe(0.5 * MAX_ZOOM);
	});

	it("拡大しても、指している画像の場所は動かない", () => {
		const start = initialCrop(600, 600, VIEW); // 倍率 0.5、(0, 0)
		// 枠の真ん中（150, 150）は元の画像の (300, 300) を指している
		const zoomed = zoomTo(start, 1, 600, 600, VIEW);
		const pointed = { x: (150 - zoomed.x) / zoomed.scale, y: (150 - zoomed.y) / zoomed.scale };
		expect(pointed).toEqual({ x: 300, y: 300 });
	});

	it("切り抜く範囲は、枠に見えている部分（元の画像の px）", () => {
		expect(sourceRect({ scale: 0.5, x: -150, y: 0 }, VIEW)).toEqual({ sx: 300, sy: 0, size: 600 });
		expect(sourceRect({ scale: 2, x: -100, y: -40 }, VIEW)).toEqual({ sx: 50, sy: 20, size: 150 });
	});
});
