import { describe, expect, it, vi } from "vitest";
import { actions } from "./+page.server";

const CHUNK = 64 * 1024;

/** Content-Length の無い multipart 風のストリーム。実際に読まれたバイト数を数える */
function streamingRequest(totalBytes: number) {
	let pulled = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (pulled >= totalBytes) {
				controller.close();
				return;
			}
			const size = Math.min(CHUNK, totalBytes - pulled);
			pulled += size;
			controller.enqueue(new Uint8Array(size));
		},
	});
	const request = new Request("http://localhost/onboarding?/save", {
		method: "POST",
		headers: { "content-type": "multipart/form-data; boundary=----anipolis" },
		body,
		// @ts-expect-error Node の fetch 実装はストリームの本文に duplex を要求する
		duplex: "half",
	});
	return { request, pulled: () => pulled };
}

function callSave(request: Request) {
	const event = {
		request,
		locals: {
			supabase: {},
			safeGetSession: vi.fn(async () => ({ user: { id: "user-1", user_metadata: {} }, session: null })),
		},
	};
	const save = actions["save"];
	if (!save) throw new Error("missing save action");
	return save(event as unknown as Parameters<typeof save>[0]);
}

describe("onboarding ?/save のフォーム読み込み（#327）", () => {
	it("Content-Length が無くても、上限を超えた時点で読み込みを打ち切って 413 を返す", async () => {
		const total = 10 * 1024 * 1024;
		const { request, pulled } = streamingRequest(total);

		const result = await callSave(request);

		expect(result).toMatchObject({
			status: 413,
			data: { field: "avatar", message: "画像は2MB以内にしてください" },
		});
		// 全量（10MB）を読まず、上限（2MB + multipart の余裕）付近で止めている
		expect(pulled()).toBeLessThan(3 * 1024 * 1024);
	});

	it("Content-Length の申告が上限を超えていれば本文を読まずに 413", async () => {
		const request = new Request("http://localhost/onboarding?/save", {
			method: "POST",
			headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(50 * 1024 * 1024) },
			body: "x",
		});
		const result = await callSave(request);
		expect(result).toMatchObject({ status: 413 });
	});

	it("multipart として読めない送信は 400", async () => {
		const request = new Request("http://localhost/onboarding?/save", {
			method: "POST",
			headers: { "content-type": "multipart/form-data; boundary=x" },
			body: "broken",
		});
		const result = await callSave(request);
		expect(result).toMatchObject({ status: 400, data: { message: "フォームの送信内容を読み取れませんでした" } });
	});
});
