import { describe, expect, it } from "vitest";
import { isOwnPostImage, postImageMediaUrl, postImagePathFromUrl } from "./post-image-url";

const STORED = "https://project.supabase.co/storage/v1/object/public/post-images/user-1/1760000000000-abc.png";

describe("投稿画像の URL（#316）", () => {
	it("保存している URL からバケット内のパスを取り出す", () => {
		expect(postImagePathFromUrl(STORED)).toBe("user-1/1760000000000-abc.png");
		expect(postImagePathFromUrl(`${STORED}?v=1`)).toBe("user-1/1760000000000-abc.png");
		expect(postImagePathFromUrl("https://example.com/a.png")).toBeNull();
	});

	it("固定リンクにする。形式が違う URL はそのまま返す", () => {
		expect(postImageMediaUrl(STORED)).toBe("/api/media/post-images/user-1/1760000000000-abc.png");
		expect(postImageMediaUrl("/anipolis-logo-light.png")).toBe("/anipolis-logo-light.png");
	});
});

describe("isOwnPostImage（PR #380 レビュー）", () => {
	it("投稿者自身のフォルダの画像だけを本人のものとみなす", () => {
		expect(isOwnPostImage(STORED, "user-1")).toBe(true);
		expect(isOwnPostImage(STORED, "user-2")).toBe(false);
		expect(isOwnPostImage("https://example.com/user-1/a.png", "user-1")).toBe(false);
		expect(
			isOwnPostImage(
				"https://p.supabase.co/storage/v1/object/public/post-images/user-1/../user-2/a.png",
				"user-1",
			),
		).toBe(false);
	});
});
