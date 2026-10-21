import { describe, expect, it } from "vitest";
import { isOwnPostImage, ownedPostImagePath, postImageMediaUrl, postImagePathFromUrl } from "./post-image-url";

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

describe("ownedPostImagePath（#235）", () => {
	const base = "https://project.supabase.co/storage/v1/object/public/post-images/";

	it("<投稿者 id>/<ファイル名> の形ならパスを返す（クエリは無視する）", () => {
		expect(ownedPostImagePath(STORED, "user-1")).toBe("user-1/1760000000000-abc.png");
		expect(ownedPostImagePath(`${STORED}?v=1`, "user-1")).toBe("user-1/1760000000000-abc.png");
	});

	it("他人のフォルダ・外部の URL は認めない", () => {
		expect(ownedPostImagePath(STORED, "user-2")).toBeNull();
		expect(ownedPostImagePath("https://example.com/user-1/a.png", "user-1")).toBeNull();
	});

	it("URL エンコードで他人のフォルダを指すパスは、デコードした後で弾く", () => {
		expect(ownedPostImagePath(`${base}user-1/%2e%2e/user-2/a.png`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/..%2Fuser-2%2Fa.png`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1%2F..%2Fuser-2/a.png`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/%E0%A4%A.png`, "user-1")).toBeNull();
	});

	it("サブフォルダ・ドットだけのファイル名・使えない文字は認めない", () => {
		expect(ownedPostImagePath(`${base}user-1/sub/a.png`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/..`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/.hidden`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/a%20b.png`, "user-1")).toBeNull();
		expect(ownedPostImagePath(`${base}user-1/`, "user-1")).toBeNull();
	});
});
