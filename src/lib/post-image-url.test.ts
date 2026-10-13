import { describe, expect, it } from "vitest";
import { postImageMediaUrl, postImagePathFromUrl } from "./post-image-url";

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
