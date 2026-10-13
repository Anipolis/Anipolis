import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/public", () => ({ env: { PUBLIC_SUPABASE_URL: "https://project.supabase.co" } }));
const sign = vi.fn(
	async (urls: string[]) => new Map(urls.map((url) => [url, `https://signed.example/${url.split("/").pop()}`])),
);
vi.mock("$lib/server/post-image-signing", () => ({ signPostImageUrls: (urls: string[]) => sign(urls) }));

import { GET } from "./+server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const PATH = `${OWNER}/1760000000000-0b7c6a8e-5d4f-4a3b-9c2d-1e0f9a8b7c6d.png`;

function call(path: string, options: { viewer?: string | null; visiblePosts?: number } = {}) {
	const headers: Record<string, string> = {};
	const limit = vi.fn(async () => ({ data: Array(options.visiblePosts ?? 0).fill({ id: "p" }), error: null }));
	const event = {
		params: { path },
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
		locals: {
			supabase: { from: () => ({ select: () => ({ contains: () => ({ limit }) }) }) },
			safeGetSession: async () => ({ user: options.viewer ? { id: options.viewer } : null, session: null }),
		},
	};
	return { result: GET(event as unknown as Parameters<typeof GET>[0]), headers, limit };
}

beforeEach(() => {
	sign.mockClear();
});

describe("GET /api/media/post-images/…（#316）", () => {
	it("閲覧できる投稿の画像なら、期限付き URL へ転送する（未ログインの OGP 取得を含む）", async () => {
		const { result, headers } = call(PATH, { visiblePosts: 1 });
		await expect(result).rejects.toMatchObject({
			status: 302,
			location: expect.stringContaining("https://signed.example/"),
		});
		expect(headers["cache-control"]).toBe("private, max-age=300");
	});

	it("閲覧できる投稿に使われていない画像（鍵・非表示・BAN・ブロック・削除）は 404", async () => {
		const { result } = call(PATH, { viewer: "22222222-2222-4222-8222-222222222222", visiblePosts: 0 });
		await expect(result).rejects.toMatchObject({ status: 404 });
		expect(sign).not.toHaveBeenCalled();
	});

	it("本人の画像は投稿前（投稿欄のプレビュー）でも見られる", async () => {
		const { result, limit } = call(PATH, { viewer: OWNER, visiblePosts: 0 });
		await expect(result).rejects.toMatchObject({ status: 302 });
		expect(limit).not.toHaveBeenCalled();
	});

	it("想定外のパス（.. やサブフォルダ）は 404", async () => {
		for (const path of [`${OWNER}/../x.png`, `${OWNER}/a/b.png`, "x.png"]) {
			await expect(call(path, { visiblePosts: 1 }).result).rejects.toMatchObject({ status: 404 });
		}
	});
});
