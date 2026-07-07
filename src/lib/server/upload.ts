/**
 * 画像アップロードの共有バリデーション。
 *
 * クライアント申告の MIME（file.type）とファイル名拡張子は自由に偽装できるため、
 * 保存する MIME・拡張子は必ずマジックバイトの判定結果から導出する。
 */

export const IMAGE_EXT_BY_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
};

/** 先頭バイト列から画像形式を判定する。未対応・非画像なら null */
export function sniffImageMime(bytes: Uint8Array): string | null {
	if (bytes.length < 12) return null;
	// JPEG: FF D8 FF
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	// GIF: "GIF8"
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
	// WebP: "RIFF" .... "WEBP"
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

/**
 * 画像バッファをマジックバイトで検証し、保存に使う MIME と拡張子を返す。
 * 非画像または許可外の形式なら null。
 */
export function validateImageBuffer(
	buffer: ArrayBuffer,
	allowedMimes: readonly string[],
): { mime: string; ext: string } | null {
	const mime = sniffImageMime(new Uint8Array(buffer));
	if (!mime || !allowedMimes.includes(mime)) return null;
	const ext = IMAGE_EXT_BY_MIME[mime];
	return ext ? { mime, ext } : null;
}

/** multipart 境界・付随フィールド分の余裕。ファイル上限ちょうどのアップロードを弾かないために加算する */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * リクエストボディを上限付きでストリーミング読みして FormData として返す。
 *
 * `request.formData()` を直接呼ぶとサイズ検証前にボディ全量がメモリへバッファされるため、
 * 巨大ボディの送りつけ（メモリ DoS）を上限到達時点の読み込み中断で防ぐ。
 * 上限超過なら "too_large"、ボディなし・multipart として解釈不能なら "invalid" を返す。
 */
export async function readFormDataWithLimit(
	request: Request,
	maxBytes: number,
): Promise<FormData | "too_large" | "invalid"> {
	// Content-Length 申告による早期拒否（偽装可能だが正直なクライアントを速く弾ける）
	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength > maxBytes) return "too_large";

	if (!request.body) return "invalid";

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			await reader.cancel();
			return "too_large";
		}
		chunks.push(value);
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	const contentType = request.headers.get("content-type") ?? "";
	try {
		return await new Response(body, { headers: { "content-type": contentType } }).formData();
	} catch {
		return "invalid";
	}
}

/** Supabase Storage の public URL からバケット内パスを取り出す（不一致なら null） */
export function publicUrlToStoragePath(url: string, bucket: string): string | null {
	const marker = `/storage/v1/object/public/${bucket}/`;
	const idx = url.indexOf(marker);
	if (idx === -1) return null;
	const path = url.slice(idx + marker.length).split("?")[0] ?? "";
	if (!path) return null;
	try {
		return decodeURIComponent(path);
	} catch {
		return null;
	}
}
