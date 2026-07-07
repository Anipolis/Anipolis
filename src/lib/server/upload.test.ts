import { describe, expect, it } from "vitest";
import { publicUrlToStoragePath, readFormDataWithLimit, sniffImageMime, validateImageBuffer } from "./upload";

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

describe("readFormDataWithLimit", () => {
	/** 実際の multipart ボディを持つ Request（FormData の往復検証用） */
	function multipartRequest(fileBytes: Uint8Array): Request {
		const form = new FormData();
		form.set("file", new Blob([fileBytes as BlobPart], { type: "application/octet-stream" }), "a.bin");
		return new Request("http://localhost/api/upload", { method: "POST", body: form });
	}

	/**
	 * 指定バイト数を複数チャンクに分けて流し、cancel を素直に受け付ける Request。
	 * multipart として妥当である必要はない（上限超過テストはパース前に打ち切られる）。
	 */
	function chunkedByteRequest(totalBytes: number, contentLength?: string): Request {
		const chunkSize = 16 * 1024;
		let remaining = totalBytes;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (remaining <= 0) {
					controller.close();
					return;
				}
				const size = Math.min(chunkSize, remaining);
				remaining -= size;
				controller.enqueue(new Uint8Array(size));
			},
		});
		return new Request("http://localhost/api/upload", {
			method: "POST",
			body: stream,
			// @ts-expect-error duplex is required by the runtime when body is a stream
			duplex: "half",
			headers: {
				"content-type": "multipart/form-data; boundary=x",
				...(contentLength ? { "content-length": contentLength } : {}),
			},
		});
	}

	it("上限内のボディは FormData として返す", async () => {
		const request = multipartRequest(new Uint8Array(1024));
		const result = await readFormDataWithLimit(request, 64 * 1024);
		expect(result).toBeInstanceOf(FormData);
		const file = (result as FormData).get("file") as File;
		expect(file.size).toBe(1024);
	});

	it("ボディが上限を超えたら too_large（全量バッファせず中断）", async () => {
		const request = chunkedByteRequest(256 * 1024);
		expect(await readFormDataWithLimit(request, 64 * 1024)).toBe("too_large");
	});

	it("Content-Length 申告が上限超過なら読み込む前に too_large", async () => {
		const request = chunkedByteRequest(16, String(100 * 1024 * 1024));
		expect(await readFormDataWithLimit(request, 64 * 1024)).toBe("too_large");
	});

	it("ボディなしは invalid", async () => {
		const request = new Request("http://localhost/api/upload", { method: "POST" });
		expect(await readFormDataWithLimit(request, 64 * 1024)).toBe("invalid");
	});

	it("multipart として解釈できないボディは invalid", async () => {
		const request = new Request("http://localhost/api/upload", {
			method: "POST",
			body: "not-multipart",
			headers: { "content-type": "multipart/form-data; boundary=none" },
		});
		expect(await readFormDataWithLimit(request, 64 * 1024)).toBe("invalid");
	});
});
