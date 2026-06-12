import { describe, expect, it } from "vitest";
import { publicUrlToStoragePath, sniffImageMime, validateImageBuffer } from "./upload";

function bytesFrom(head: number[], length = 16): Uint8Array {
	const bytes = new Uint8Array(length);
	bytes.set(head);
	return bytes;
}

describe("sniffImageMime", () => {
	it("JPEG を判定する", () => {
		expect(sniffImageMime(bytesFrom([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
	});

	it("PNG を判定する", () => {
		expect(sniffImageMime(bytesFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
	});

	it("GIF を判定する", () => {
		expect(sniffImageMime(bytesFrom([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
	});

	it("WebP を判定する", () => {
		const head = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
		expect(sniffImageMime(bytesFrom(head))).toBe("image/webp");
	});

	it("SVG/HTML などの非対応形式は null", () => {
		const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		expect(sniffImageMime(svg)).toBe(null);
	});

	it("短すぎるバッファは null", () => {
		expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBe(null);
	});
});

describe("validateImageBuffer", () => {
	it("許可リスト外の形式は null（GIF を不許可にした場合）", () => {
		const gif = bytesFrom([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
		expect(validateImageBuffer(gif.buffer as ArrayBuffer, ["image/jpeg", "image/png"])).toBe(null);
	});

	it("許可された形式は MIME と拡張子を返す", () => {
		const png = bytesFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(validateImageBuffer(png.buffer as ArrayBuffer, ["image/png"])).toEqual({
			mime: "image/png",
			ext: "png",
		});
	});
});

describe("publicUrlToStoragePath", () => {
	it("public URL からパスを抽出する", () => {
		const url = "https://xyz.supabase.co/storage/v1/object/public/post-images/user-1/123-abc.jpg";
		expect(publicUrlToStoragePath(url, "post-images")).toBe("user-1/123-abc.jpg");
	});

	it("クエリ文字列を除去する", () => {
		const url = "https://xyz.supabase.co/storage/v1/object/public/post-images/u/a.jpg?width=100";
		expect(publicUrlToStoragePath(url, "post-images")).toBe("u/a.jpg");
	});

	it("別バケットの URL は null", () => {
		const url = "https://xyz.supabase.co/storage/v1/object/public/profile-avatars/u/a.jpg";
		expect(publicUrlToStoragePath(url, "post-images")).toBe(null);
	});

	it("ストレージ URL でなければ null", () => {
		expect(publicUrlToStoragePath("https://example.com/a.jpg", "post-images")).toBe(null);
	});
});
